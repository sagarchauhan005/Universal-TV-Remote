package com.samsungremote

import android.net.wifi.WifiManager
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.samsungremote.tv.SamsungTvClient
import com.samsungremote.tv.TokenRepository
import java.net.Inet4Address
import java.net.NetworkInterface

class SamsungTvModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val tokenRepository = TokenRepository(reactContext)
    private val mainHandler = Handler(Looper.getMainLooper())

    private var client: SamsungTvClient? = null

    override fun getName(): String = "SamsungTvRemote"

    // Required by NativeEventEmitter
    @ReactMethod
    fun addListener(eventName: String?) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Int?) { /* no-op */ }

    private fun getOrCreateClient(): SamsungTvClient {
        if (client == null) {
            client = SamsungTvClient(reactApplicationContext, tokenRepository) { event, data ->
                mainHandler.post {
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        ?.emit(event, data)
                }
            }
        }
        return client!!
    }

    @ReactMethod
    fun discover(promise: Promise) {
        try {
            getOrCreateClient().discover { ips ->
                mainHandler.post {
                    val arr = Arguments.createArray()
                    ips.forEach { arr.pushString(it) }
                    promise.resolve(arr)
                }
            }
        } catch (e: Exception) {
            promise.reject("DISCOVER_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun connect(ip: String, promise: Promise) {
        try {
            getOrCreateClient().connect(ip) { success, error ->
                mainHandler.post {
                    if (success) {
                        promise.resolve(null)
                    } else {
                        promise.reject("CONNECT_ERROR", error ?: "Connection failed")
                    }
                }
            }
        } catch (e: Exception) {
            promise.reject("CONNECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            getOrCreateClient().disconnect()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun sendKey(key: String, promise: Promise) {
        try {
            val sent = getOrCreateClient().sendKey(key)
            promise.resolve(sent)
        } catch (e: Exception) {
            promise.reject("SEND_KEY_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        try {
            promise.resolve(client?.isConnected() ?: false)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getLastConnectedIp(promise: Promise) {
        try {
            promise.resolve(tokenRepository.getLastConnectedIp())
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    /**
     * Returns network info: device IP and WiFi SSID (if available).
     * Useful for displaying on the discovery screen so the user can verify
     * they're on the correct network.
     */
    @ReactMethod
    fun getNetworkInfo(promise: Promise) {
        try {
            val result = Arguments.createMap()

            // Get device IP from network interfaces (works without location permission)
            val deviceIp = getDeviceIpAddress()
            result.putString("ip", deviceIp ?: "Unknown")

            // Get WiFi SSID — on Android 10+ this requires location permission.
            // Try ConnectivityManager first (Android 12+), then fallback to WifiManager.
            try {
                var ssid = ""
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                    // Android 12+: use ConnectivityManager.NetworkCallback approach
                    val cm = reactApplicationContext.applicationContext
                        .getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as? android.net.ConnectivityManager
                    val network = cm?.activeNetwork
                    val caps = if (network != null) cm?.getNetworkCapabilities(network) else null
                    val wifiInfo = caps?.transportInfo as? android.net.wifi.WifiInfo
                    ssid = wifiInfo?.ssid ?: ""
                }
                if (ssid.isEmpty() || ssid == "<unknown ssid>") {
                    // Fallback to WifiManager (works on Android 9 and below, or 10+ with location)
                    val wifi = reactApplicationContext.applicationContext
                        .getSystemService(android.content.Context.WIFI_SERVICE) as? WifiManager
                    val info = wifi?.connectionInfo
                    ssid = info?.ssid ?: ""
                }
                // Android wraps SSID in quotes, remove them
                ssid = ssid.replace("\"", "").trim()
                if (ssid == "<unknown ssid>" || ssid.isEmpty()) {
                    result.putString("ssid", "")
                } else {
                    result.putString("ssid", ssid)
                }
            } catch (_: Exception) {
                result.putString("ssid", "")
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message, e)
        }
    }

    private fun getDeviceIpAddress(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (intf in interfaces) {
                // Prefer wlan0 (WiFi) interface
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
}
