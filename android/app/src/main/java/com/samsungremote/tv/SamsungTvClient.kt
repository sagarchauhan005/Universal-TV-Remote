package com.samsungremote.tv

import android.content.Context
import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.DatagramPacket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.Socket
import java.nio.ByteBuffer
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import java.security.cert.X509Certificate

class SamsungTvClient(
    private val context: Context,
    private val tokenRepository: TokenRepository,
    private val onEvent: (String, WritableMap?) -> Unit
) {
    companion object {
        private const val TAG = "SamsungTvClient"
        private const val SSDP_HOST = "239.255.255.250"
        private const val SSDP_PORT = 1900
        private const val SAMSUNG_URN = "urn:samsung.com:device:RemoteControlReceiver:1"
        private const val DIAL_URN = "urn:dial-multiscreen-org:service:dial:1"
        private const val SSDP_ALL = "ssdp:all"
        private const val APP_NAME = "Universal TV Remote"
        private const val REMOTE_PORT_WSS = 8002
        private const val REMOTE_PORT_WS = 8001
        private const val SEARCH_TIMEOUT_MS = 4000
    }

    private var webSocket: WebSocket? = null
    private val discoveredIps = ConcurrentHashMap.newKeySet<String>()
    private val isConnecting = AtomicBoolean(false)
    private var pendingConnectionCallback: ((Boolean, String?) -> Unit)? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var connectionTimeoutRunnable: Runnable? = null

    // Separate clients for ws and wss to avoid TLS issues
    private val wsClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(0, java.util.concurrent.TimeUnit.SECONDS) // no read timeout for WebSocket
            .writeTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .addNetworkInterceptor { chain ->
                val request = chain.request()
                Log.d(TAG, "WS request headers: ${request.headers}")
                chain.proceed(request)
            }
            .build()
    }

    private val wssClient by lazy {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        })
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, trustAllCerts, java.security.SecureRandom())
        OkHttpClient.Builder()
            .connectTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(0, java.util.concurrent.TimeUnit.SECONDS)
            .writeTimeout(10, java.util.concurrent.TimeUnit.SECONDS)
            .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
            .hostnameVerifier { _, _ -> true }
            .addNetworkInterceptor { chain ->
                val request = chain.request()
                Log.d(TAG, "WSS request headers: ${request.headers}")
                chain.proceed(request)
            }
            .build()
    }

    fun discover(callback: (List<String>) -> Unit) {
        discoveredIps.clear()
        Thread {
            var multicastLock: WifiManager.MulticastLock? = null
            try {
                val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
                multicastLock = wifi?.createMulticastLock("SamsungRemoteSSDP")?.apply {
                    setReferenceCounted(false)
                    acquire()
                }

                val group = InetAddress.getByName(SSDP_HOST)
                val socket = MulticastSocket().apply {
                    soTimeout = SEARCH_TIMEOUT_MS
                    joinGroup(group)
                }

                fun sendSearch(st: String) {
                    val searchMsg = """
                        M-SEARCH * HTTP/1.1
                        HOST: $SSDP_HOST:$SSDP_PORT
                        MAN: "ssdp:discover"
                        ST: $st
                        MX: 3

                    """.trimIndent().replace("\n", "\r\n")
                    val sendData = searchMsg.toByteArray(Charsets.US_ASCII)
                    val sendPacket = DatagramPacket(sendData, sendData.size, group, SSDP_PORT)
                    for (i in 0..2) {
                        try { socket.send(sendPacket) } catch (_: Exception) {}
                        Thread.sleep(150)
                    }
                }

                // Send all three search types for maximum compatibility.
                // Some TVs only respond to ssdp:all, others to specific URNs.
                Log.d(TAG, "Sending SSDP M-SEARCH (ssdp:all, Samsung URN, DIAL URN)")
                sendSearch(SSDP_ALL)
                Thread.sleep(300)
                sendSearch(SAMSUNG_URN)
                Thread.sleep(300)
                sendSearch(DIAL_URN)

                val receiveData = ByteArray(4096)
                val endTime = System.currentTimeMillis() + SEARCH_TIMEOUT_MS
                while (System.currentTimeMillis() < endTime) {
                    try {
                        val receivePacket = DatagramPacket(receiveData, receiveData.size)
                        socket.receive(receivePacket)
                        val response = String(receivePacket.data, 0, receivePacket.length, Charsets.US_ASCII)
                        val responseLower = response.lowercase()

                        // Only collect IPs from responses that look like TVs / media devices
                        val isTvLikely = responseLower.contains("samsung") ||
                                responseLower.contains("tizen") ||
                                responseLower.contains("tv") ||
                                responseLower.contains("dial") ||
                                responseLower.contains("mediarenderer") ||
                                responseLower.contains("remotecontrol") ||
                                responseLower.contains("roku") ||
                                responseLower.contains("lg") ||
                                responseLower.contains("webos") ||
                                responseLower.contains("android")

                        if (isTvLikely) {
                            val ip = extractIpFromSsdpResponse(response) ?: receivePacket.address?.hostAddress
                            if (ip != null) {
                                Log.d(TAG, "SSDP found TV-like device at $ip")
                                discoveredIps.add(ip)
                            }
                        }
                    } catch (_: java.net.SocketTimeoutException) {
                        // continue until endTime
                    }
                }
                try { socket.leaveGroup(group) } catch (_: Exception) {}
                socket.close()
                Log.d(TAG, "SSDP discovery complete. Found ${discoveredIps.size} IPs: ${discoveredIps.toList()}")

                // If SSDP found nothing, fall back to subnet port scan
                if (discoveredIps.isEmpty()) {
                    Log.d(TAG, "SSDP found nothing. Starting subnet port scan fallback...")
                    val subnetIps = scanSubnetForTvPorts()
                    discoveredIps.addAll(subnetIps)
                    Log.d(TAG, "Subnet scan found ${subnetIps.size} IPs: $subnetIps")
                }

                val list = discoveredIps.toList().sorted()
                callback(list)
            } catch (e: Exception) {
                Log.e(TAG, "SSDP discovery failed", e)

                // Still try subnet scan even if SSDP itself crashed
                Log.d(TAG, "Trying subnet scan after SSDP failure...")
                try {
                    val subnetIps = scanSubnetForTvPorts()
                    if (subnetIps.isNotEmpty()) {
                        Log.d(TAG, "Subnet scan found ${subnetIps.size} IPs: $subnetIps")
                        callback(subnetIps)
                        return@Thread
                    }
                } catch (_: Exception) {}

                val map = Arguments.createMap()
                map.putString("error", e.message ?: "Discovery failed")
                onEvent("discoveryError", map)
                callback(emptyList())
            } finally {
                try {
                    multicastLock?.release()
                } catch (_: Exception) {}
            }
        }.start()
    }

    /**
     * Scans the local /24 subnet for Samsung TV ports (8001, 8002).
     * Probes IPs 1-60 in parallel using a thread pool with a short connect timeout.
     * Returns a list of IPs that have port 8001 open (Samsung TV REST API).
     */
    private fun scanSubnetForTvPorts(): List<String> {
        val deviceIp = getDeviceIpAddress()
        if (deviceIp == null) {
            Log.w(TAG, "Cannot determine device IP for subnet scan")
            return emptyList()
        }

        Log.d(TAG, "Device IP: $deviceIp")
        val parts = deviceIp.split(".")
        if (parts.size != 4) return emptyList()

        val subnet = "${parts[0]}.${parts[1]}.${parts[2]}"
        val myLastOctet = parts[3].toIntOrNull() ?: return emptyList()

        val foundIps = ConcurrentHashMap.newKeySet<String>()
        val executor = Executors.newFixedThreadPool(20) // 20 parallel probes
        val latch = CountDownLatch(60) // Probe IPs 1-60

        for (i in 1..60) {
            if (i == myLastOctet) {
                latch.countDown()
                continue
            }
            val probeIp = "$subnet.$i"
            executor.submit {
                try {
                    // Try to connect to Samsung TV REST API port
                    val socket = Socket()
                    socket.connect(InetSocketAddress(probeIp, REMOTE_PORT_WS), 800) // 800ms timeout
                    socket.close()
                    Log.d(TAG, "Port $REMOTE_PORT_WS open on $probeIp")
                    foundIps.add(probeIp)
                } catch (_: Exception) {
                    // Port closed or unreachable — not a TV
                } finally {
                    latch.countDown()
                }
            }
        }

        // Wait for all probes to complete (max ~2 seconds)
        try { latch.await(5, java.util.concurrent.TimeUnit.SECONDS) } catch (_: Exception) {}
        executor.shutdownNow()

        return foundIps.toList().sorted()
    }

    private fun getDeviceIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (intf in interfaces) {
                if (!intf.isUp || intf.isLoopback) continue
                val addresses = intf.inetAddresses
                for (addr in addresses) {
                    if (addr is Inet4Address && !addr.isLoopbackAddress) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (_: Exception) {}
        return null
    }

    private fun extractIpFromSsdpResponse(response: String): String? {
        val lines = response.split("\r\n", "\n")
        for (line in lines) {
            if (line.uppercase().startsWith("LOCATION:")) {
                val url = line.substringAfter(":").trim()
                val regex = Regex("""(?:https?://)?([0-9.]+)(?::\d+)?""")
                val match = regex.find(url)
                return match?.groupValues?.get(1)
            }
        }
        return null
    }

    fun connect(ip: String, callback: (Boolean, String?) -> Unit) {
        if (isConnecting.getAndSet(true)) {
            callback(false, "Already connecting")
            return
        }
        disconnect()

        val appNameB64 = Base64.encodeToString(APP_NAME.toByteArray(Charsets.UTF_8), Base64.NO_WRAP)

        // Use stored token if available (from a previous successful connection)
        val storedToken = tokenRepository.getToken(ip)
        val path = if (!storedToken.isNullOrEmpty()) {
            Log.d(TAG, "Using stored token")
            "/api/v2/channels/samsung.remote.control?name=$appNameB64&token=$storedToken"
        } else {
            Log.d(TAG, "No stored token — fresh pairing attempt")
            "/api/v2/channels/samsung.remote.control?name=$appNameB64"
        }

        Log.d(TAG, "Connecting to $ip with appName=$APP_NAME (raw WebSocket)")

        pendingConnectionCallback = callback
        connectionTimeoutRunnable = Runnable {
            pendingConnectionCallback?.let { cb ->
                pendingConnectionCallback = null
                isConnecting.set(false)
                Log.d(TAG, "Connection timed out to $ip")
                val map = Arguments.createMap()
                map.putString("error", "Connection timed out. TV did not respond.")
                onEvent("error", map)
                cb(false, "Connection timed out. TV did not respond.")
            }
        }
        mainHandler.postDelayed(connectionTimeoutRunnable!!, 15000)

        // Try wss:8002 first (Samsung TVs require secure WebSocket),
        // then fall back to ws:8001 for older models.
        Thread {
            try {
                connectRawWebSocket(ip, REMOTE_PORT_WSS, path, true, callback)
            } catch (e: Exception) {
                Log.e(TAG, "wss://$ip:$REMOTE_PORT_WSS failed: ${e.message}, trying ws...")
                try {
                    connectRawWebSocket(ip, REMOTE_PORT_WS, path, false, callback)
                } catch (e2: Exception) {
                    Log.e(TAG, "ws://$ip:$REMOTE_PORT_WS also failed: ${e2.message}")
                    connectionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                    connectionTimeoutRunnable = null
                    isConnecting.set(false)
                    pendingConnectionCallback?.let { cb ->
                        pendingConnectionCallback = null
                        val map = Arguments.createMap()
                        map.putString("error", e.message ?: "Connection failed")
                        onEvent("error", map)
                        cb(false, e.message ?: "Connection failed")
                    }
                }
            }
        }.start()
    }

    /**
     * Raw WebSocket connection using Java Sockets.
     * This sends the EXACT same minimal headers as Python's websocket-client,
     * avoiding any OkHttp-specific headers that might cause the TV to reject.
     */
    private fun connectRawWebSocket(
        ip: String,
        port: Int,
        path: String,
        useSsl: Boolean,
        callback: (Boolean, String?) -> Unit
    ) {
        val scheme = if (useSsl) "wss" else "ws"
        Log.d(TAG, "Attempting raw WebSocket: $scheme://$ip:$port$path")

        val rawSocket = Socket()
        rawSocket.connect(InetSocketAddress(ip, port), 10000)
        rawSocket.soTimeout = 10000

        val socket: Socket = if (useSsl) {
            val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
                override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            })
            val sslContext = SSLContext.getInstance("TLS")
            sslContext.init(null, trustAllCerts, java.security.SecureRandom())
            val sslSocket = sslContext.socketFactory.createSocket(rawSocket, ip, port, true) as javax.net.ssl.SSLSocket
            sslSocket.startHandshake()
            sslSocket
        } else {
            rawSocket
        }

        val output = socket.getOutputStream()
        val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))

        // Generate WebSocket key
        val keyBytes = ByteArray(16)
        java.security.SecureRandom().nextBytes(keyBytes)
        val wsKey = Base64.encodeToString(keyBytes, Base64.NO_WRAP)

        // Send WebSocket upgrade request (minimal headers, like Python)
        val request = "GET $path HTTP/1.1\r\n" +
                "Host: $ip:$port\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Key: $wsKey\r\n" +
                "Sec-WebSocket-Version: 13\r\n" +
                "\r\n"

        Log.d(TAG, "Sending WebSocket upgrade request to $ip:$port")
        output.write(request.toByteArray(Charsets.US_ASCII))
        output.flush()

        // Read HTTP response
        val statusLine = reader.readLine()
        Log.d(TAG, "WebSocket upgrade response: $statusLine")

        if (statusLine == null || !statusLine.contains("101")) {
            socket.close()
            throw Exception("WebSocket upgrade failed: $statusLine")
        }

        // Read remaining headers
        while (true) {
            val line = reader.readLine() ?: break
            if (line.isEmpty()) break
            Log.d(TAG, "  Header: $line")
        }

        Log.d(TAG, "WebSocket handshake complete to $ip:$port")

        // Store the socket for later use
        rawWebSocket = socket
        rawOutputStream = output

        // Read the first message (should be ms.channel.connect or ms.channel.unauthorized)
        val firstMsg = readWebSocketFrame(socket)
        Log.d(TAG, "First message from TV: ${firstMsg?.take(200)}")

        if (firstMsg == null) {
            socket.close()
            rawWebSocket = null
            rawOutputStream = null
            throw Exception("No response from TV")
        }

        if (firstMsg.contains("ms.channel.connect") || firstMsg.contains("ms.channel.ready")) {
            // SUCCESS - TV accepted connection
            connectionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            connectionTimeoutRunnable = null

            val tokenMatch = Regex("""\"token\"\s*:\s*\"([^\"]+)\"""").find(firstMsg)
            tokenMatch?.groupValues?.get(1)?.let { token ->
                if (token.isNotBlank()) tokenRepository.saveToken(ip, token)
            }
            tokenRepository.setLastConnectedIp(ip)
            isConnecting.set(false)

            pendingConnectionCallback?.let { cb ->
                pendingConnectionCallback = null
                mainHandler.post {
                    onEvent("connected", Arguments.createMap().apply { putString("ip", ip) })
                    cb(true, null)
                }
            }

            Log.d(TAG, "Connected to $ip via raw WebSocket ($scheme:$port)")

            // Start background reader for ongoing messages
            startRawMessageReader(socket, ip)

        } else if (firstMsg.contains("ms.channel.unauthorized")) {
            socket.close()
            rawWebSocket = null
            rawOutputStream = null
            tokenRepository.clearToken(ip)
            connectionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
            connectionTimeoutRunnable = null
            isConnecting.set(false)

            val errorMsg = "TV denied the connection. Please try again — check the TV screen for an Allow/Deny prompt. If no prompt appears, go to TV Settings > General > External Device Manager and remove blocked devices."
            pendingConnectionCallback?.let { cb ->
                pendingConnectionCallback = null
                mainHandler.post {
                    val map = Arguments.createMap()
                    map.putString("error", errorMsg)
                    onEvent("error", map)
                    cb(false, errorMsg)
                }
            }
            throw Exception(errorMsg)
        } else {
            Log.w(TAG, "Unexpected first message: $firstMsg")
            // Treat as potential success, let timeout handle it
        }
    }

    private var rawWebSocket: Socket? = null
    private var rawOutputStream: OutputStream? = null

    /**
     * Read a single WebSocket frame from the socket.
     * Properly handles different opcodes: text (0x1), binary (0x2), close (0x8), ping (0x9), pong (0xA).
     * Returns null on connection close or error.
     */
    private fun readWebSocketFrame(socket: Socket): String? {
        try {
            val input = socket.getInputStream()

            val byte1 = input.read()
            if (byte1 == -1) return null

            val opcode = byte1 and 0x0F
            val fin = (byte1 and 0x80) != 0

            val byte2 = input.read()
            if (byte2 == -1) return null

            val masked = (byte2 and 0x80) != 0
            var payloadLength = (byte2 and 0x7F).toLong()

            if (payloadLength == 126L) {
                val b1 = input.read()
                val b2 = input.read()
                payloadLength = ((b1 shl 8) or b2).toLong()
            } else if (payloadLength == 127L) {
                var len = 0L
                for (i in 0 until 8) {
                    len = (len shl 8) or input.read().toLong()
                }
                payloadLength = len
            }

            val maskKey = if (masked) {
                ByteArray(4).also { input.read(it) }
            } else null

            val payload = ByteArray(payloadLength.toInt())
            var bytesRead = 0
            while (bytesRead < payloadLength) {
                val n = input.read(payload, bytesRead, (payloadLength - bytesRead).toInt())
                if (n == -1) break
                bytesRead += n
            }

            if (maskKey != null) {
                for (i in payload.indices) {
                    payload[i] = (payload[i].toInt() xor maskKey[i % 4].toInt()).toByte()
                }
            }

            Log.d(TAG, "WS frame: opcode=$opcode fin=$fin len=$payloadLength")

            return when (opcode) {
                0x1 -> String(payload, Charsets.UTF_8) // Text frame
                0x2 -> { // Binary frame — try to read as UTF-8
                    val text = String(payload, Charsets.UTF_8)
                    Log.d(TAG, "Binary frame as text: $text")
                    text
                }
                0x8 -> { // Close frame
                    Log.d(TAG, "Received close frame")
                    null
                }
                0x9 -> { // Ping — respond with pong
                    Log.d(TAG, "Received ping, sending pong")
                    try {
                        val pongFrame = ByteArray(2)
                        pongFrame[0] = 0x8A.toByte() // FIN + pong
                        pongFrame[1] = 0x00 // no payload
                        socket.getOutputStream().write(pongFrame)
                        socket.getOutputStream().flush()
                    } catch (_: Exception) {}
                    // Continue reading next frame
                    readWebSocketFrame(socket)
                }
                0xA -> { // Pong — ignore, continue reading
                    readWebSocketFrame(socket)
                }
                else -> {
                    Log.w(TAG, "Unknown opcode $opcode, payload hex: ${payload.take(50).joinToString("") { "%02x".format(it) }}")
                    String(payload, Charsets.UTF_8)
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error reading WebSocket frame: ${e.message}")
            return null
        }
    }

    /**
     * Send a WebSocket text frame (client → server frames must be masked).
     */
    private fun sendWebSocketFrame(output: OutputStream, text: String) {
        val payload = text.toByteArray(Charsets.UTF_8)
        val maskKey = ByteArray(4)
        java.security.SecureRandom().nextBytes(maskKey)

        val frame = ByteBuffer.allocate(2 + (if (payload.size > 125) 2 else 0) + 4 + payload.size)

        // FIN + text opcode
        frame.put(0x81.toByte())

        // Masked + payload length
        if (payload.size <= 125) {
            frame.put((0x80 or payload.size).toByte())
        } else {
            frame.put(0xFE.toByte()) // 0x80 | 126
            frame.putShort(payload.size.toShort())
        }

        // Mask key
        frame.put(maskKey)

        // Masked payload
        for (i in payload.indices) {
            frame.put((payload[i].toInt() xor maskKey[i % 4].toInt()).toByte())
        }

        frame.flip()
        output.write(frame.array(), 0, frame.limit())
        output.flush()
    }

    /**
     * Background thread to read ongoing messages from the TV.
     */
    private fun startRawMessageReader(socket: Socket, ip: String) {
        Thread {
            try {
                socket.soTimeout = 0 // No timeout for ongoing reads
                while (!socket.isClosed) {
                    val msg = readWebSocketFrame(socket)
                    if (msg == null) {
                        Log.d(TAG, "WebSocket connection closed by TV")
                        break
                    }
                    Log.d(TAG, "TV message: ${msg.take(200)}")
                }
            } catch (e: Exception) {
                Log.d(TAG, "WebSocket reader ended: ${e.message}")
            } finally {
                rawWebSocket = null
                rawOutputStream = null
                mainHandler.post {
                    onEvent("disconnected", Arguments.createMap().apply { putString("reason", "Connection closed") })
                }
            }
        }.start()
    }

    private fun handleMessage(text: String, ip: String, callback: (Boolean, String?) -> Unit) {
        try {
            when {
                text.contains("ms.channel.connect") || text.contains("ms.channel.ready") -> {
                    connectionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                    connectionTimeoutRunnable = null
                    val tokenMatch = Regex("""\"token\"\s*:\s*\"([^\"]+)\"""").find(text)
                    tokenMatch?.groupValues?.get(1)?.let { token ->
                        if (token.isNotBlank()) tokenRepository.saveToken(ip, token)
                    }
                    pendingConnectionCallback?.let { cb ->
                        pendingConnectionCallback = null
                        isConnecting.set(false)
                        tokenRepository.setLastConnectedIp(ip)
                        Log.d(TAG, "Connected to $ip (received ms.channel.connect)")
                        mainHandler.post {
                            onEvent("connected", Arguments.createMap().apply { putString("ip", ip) })
                            cb(true, null)
                        }
                    }
                }
                text.contains("ms.channel.unauthorized") -> {
                    Log.w(TAG, "TV at $ip denied connection (unauthorized). Clearing old token.")
                    connectionTimeoutRunnable?.let { mainHandler.removeCallbacks(it) }
                    connectionTimeoutRunnable = null
                    // Remove the old token so next attempt is completely fresh
                    tokenRepository.clearToken(ip)
                    try { webSocket?.cancel() } catch (_: Exception) {}
                    webSocket = null
                    isConnecting.set(false)
                    pendingConnectionCallback?.let { cb ->
                        pendingConnectionCallback = null
                        val map = Arguments.createMap()
                        map.putString("error", "TV denied the connection. Please try again — check the TV screen for an Allow/Deny prompt. If no prompt appears, go to TV Settings > General > External Device Manager and remove blocked devices.")
                        onEvent("error", map)
                        cb(false, "TV denied the connection. Please try again — check the TV screen for an Allow/Deny prompt. If no prompt appears, go to TV Settings > General > External Device Manager and remove blocked devices.")
                    }
                }
            }
        } catch (_: Exception) {}
    }

    fun disconnect() {
        // Close raw WebSocket
        val sock = rawWebSocket
        rawWebSocket = null
        rawOutputStream = null
        if (sock != null) {
            try { sock.close() } catch (e: Exception) {
                Log.w(TAG, "WebSocket disconnect error (ignored): ${e.message}")
            }
        }
        // Also close OkHttp WebSocket if any (legacy)
        val ws = webSocket
        webSocket = null
        if (ws != null) {
            try { ws.cancel() } catch (_: Exception) {}
        }
    }

    fun sendKey(key: String): Boolean {
        val output = rawOutputStream ?: return false
        val payload = """{"method":"ms.remote.control","params":{"Cmd":"Click","DataOfCmd":"$key","Option":"false","TypeOfRemote":"SendRemoteKey"}}"""
        return try {
            sendWebSocketFrame(output, payload)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send key: ${e.message}")
            false
        }
    }

    /** Launch app by Tizen app ID (same as POC: ms.channel.emit + ed.apps.launch). */
    fun launchApp(appId: String): Boolean {
        val output = rawOutputStream ?: return false
        val payload = """{"method":"ms.channel.emit","params":{"event":"ed.apps.launch","to":"host","data":{"action_type":"DEEP_LINK","appId":"$appId","metaTag":""}}}"""
        return try {
            sendWebSocketFrame(output, payload)
            Log.d(TAG, "Launch app: $appId")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app: ${e.message}")
            false
        }
    }

    fun isConnected(): Boolean = rawWebSocket != null && !(rawWebSocket?.isClosed ?: true)
}
