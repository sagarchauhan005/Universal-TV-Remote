package com.samsungremote.tv

import android.content.Context
import android.content.SharedPreferences

class TokenRepository(context: Context) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun getToken(ip: String): String? = prefs.getString(KEY_PREFIX + ip, null)

    fun saveToken(ip: String, token: String) {
        prefs.edit().putString(KEY_PREFIX + ip, token).apply()
    }

    fun clearToken(ip: String) {
        prefs.edit().remove(KEY_PREFIX + ip).apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
    }

    fun getLastConnectedIp(): String? = prefs.getString(KEY_LAST_IP, null)

    fun setLastConnectedIp(ip: String) {
        prefs.edit().putString(KEY_LAST_IP, ip).apply()
    }

    companion object {
        private const val PREFS_NAME = "samsung_remote"
        private const val KEY_PREFIX = "tv_token_"
        private const val KEY_LAST_IP = "last_connected_ip"
    }
}
