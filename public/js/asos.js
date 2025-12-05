/**
 * ASOS Panel - Custom JavaScript
 * Version: 1.0.0
 */

// Initialize Socket.io
var socket = null;

document.addEventListener('DOMContentLoaded', function() {
    // Initialize socket connection
    initSocket();
    
    // Check for updates on page load
    checkForUpdates();
    
    // Initialize feather icons if available
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
});

/**
 * Initialize Socket.io connection for real-time updates
 */
function initSocket() {
    try {
        socket = io();
        
        socket.on('connect', function() {
            console.log('ASOS: Socket connected');
            updateServerStatus('connected');
        });
        
        socket.on('disconnect', function() {
            console.log('ASOS: Socket disconnected');
            updateServerStatus('disconnected');
        });
        
        socket.on('system:stats', function(data) {
            updateSystemStats(data);
        });
        
        socket.on('notification', function(data) {
            showNotification(data);
        });
        
        socket.on('app:status', function(data) {
            // Handle app status changes
            if (typeof loadInstalledApps === 'function') {
                loadInstalledApps();
            }
        });
        
    } catch (e) {
        console.warn('ASOS: Socket.io not available');
    }
}

/**
 * Update server connection status in header
 */
function updateServerStatus(status) {
    var statusEl = document.getElementById('serverStatus');
    if (statusEl) {
        if (status === 'connected') {
            statusEl.textContent = 'Bağlı';
            statusEl.className = 'd-none d-xl-block ms-1 fs-12 text-success user-name-sub-text';
        } else {
            statusEl.textContent = 'Bağlantı Kesildi';
            statusEl.className = 'd-none d-xl-block ms-1 fs-12 text-danger user-name-sub-text';
        }
    }
}

/**
 * Update system stats from socket
 */
function updateSystemStats(data) {
    if (data.cpu) {
        var cpuEl = document.getElementById('cpuUsage');
        if (cpuEl) cpuEl.textContent = data.cpu.toFixed(1) + '%';
    }
    
    if (data.memory) {
        var ramEl = document.getElementById('ramUsage');
        if (ramEl) ramEl.textContent = data.memory.usedPercent.toFixed(1) + '%';
    }
    
    if (data.disk) {
        var diskEl = document.getElementById('diskUsage');
        if (diskEl) diskEl.textContent = data.disk.usedPercent.toFixed(1) + '%';
    }
}

/**
 * Check for ASOS updates
 */
function checkForUpdates() {
    fetch('/api/system/check-update')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.data && data.data.updateAvailable) {
                showUpdateNotification(data.data);
            }
        })
        .catch(function(err) {
            console.warn('ASOS: Update check failed', err);
        });
}

/**
 * Show update notification in header
 */
function showUpdateNotification(updateData) {
    var updateDropdown = document.getElementById('updateDropdown');
    if (updateDropdown) {
        updateDropdown.style.display = 'block';
        
        var newVersionEl = document.getElementById('newVersion');
        var currentVersionEl = document.getElementById('currentVersion');
        
        if (newVersionEl) newVersionEl.textContent = updateData.latestVersion;
        if (currentVersionEl) currentVersionEl.textContent = updateData.currentVersion;
    }
    
    // Show toast notification
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'info',
            title: 'Yeni güncelleme mevcut: v' + updateData.latestVersion,
            showConfirmButton: false,
            timer: 5000
        });
    }
}

/**
 * Show notification
 */
function showNotification(data) {
    // Update notification badge
    var countEl = document.getElementById('notificationCount');
    if (countEl) {
        var count = parseInt(countEl.textContent) || 0;
        countEl.textContent = count + 1;
        countEl.style.display = 'block';
    }
    
    // Show toast
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: data.type || 'info',
            title: data.message,
            showConfirmButton: false,
            timer: 3000
        });
    }
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes, decimals) {
    if (bytes === 0) return '0 B';
    var k = 1024;
    var dm = decimals || 2;
    var sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format uptime seconds to human readable
 */
function formatUptime(seconds) {
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return days + ' gün ' + hours + ' saat';
    if (hours > 0) return hours + ' saat ' + minutes + ' dk';
    return minutes + ' dakika';
}

/**
 * Format date to Turkish locale
 */
function formatDate(date) {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Copy text to clipboard
 */
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(function() {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Panoya kopyalandı',
                showConfirmButton: false,
                timer: 1500
            });
        }
    });
}

/**
 * Confirm action with SweetAlert
 */
function confirmAction(options) {
    return Swal.fire({
        title: options.title || 'Emin misiniz?',
        text: options.text || '',
        icon: options.icon || 'warning',
        showCancelButton: true,
        confirmButtonColor: options.confirmColor || '#405189',
        cancelButtonColor: options.cancelColor || '#878a99',
        confirmButtonText: options.confirmText || 'Evet',
        cancelButtonText: options.cancelText || 'İptal'
    });
}

/**
 * Show loading overlay
 */
function showLoading(text) {
    Swal.fire({
        title: text || 'Yükleniyor...',
        allowOutsideClick: false,
        didOpen: function() {
            Swal.showLoading();
        }
    });
}

/**
 * Hide loading overlay
 */
function hideLoading() {
    Swal.close();
}

/**
 * API request helper
 */
function apiRequest(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/json';
    
    return fetch(url, options)
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            if (!data.success && data.error) {
                throw new Error(data.error);
            }
            return data;
        });
}

// Expose utilities globally
window.ASOS = {
    formatBytes: formatBytes,
    formatUptime: formatUptime,
    formatDate: formatDate,
    copyToClipboard: copyToClipboard,
    confirmAction: confirmAction,
    showLoading: showLoading,
    hideLoading: hideLoading,
    apiRequest: apiRequest,
    checkForUpdates: checkForUpdates
};
