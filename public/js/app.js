// ASOS Panel Main Application
class App {
  constructor() {
    this.currentPage = 'dashboard';
    this.user = null;
    this.socket = null;
    this.init();
  }

  async init() {
    // Socket.io bağlantısı
    this.socket = io();
    this.setupSocketEvents();

    // Token kontrolü
    if (api.token) {
      try {
        const data = await api.getProfile();
        this.user = data.user;
        this.showApp();
        this.loadDashboard();
      } catch (error) {
        api.setToken(null);
        this.showLogin();
      }
    } else {
      this.showLogin();
    }

    this.setupEventListeners();
  }

  setupSocketEvents() {
    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('app:install:progress', (data) => {
      this.showToast('Uygulama Yükleme', data.message, 'info');
    });

    this.socket.on('app:install:complete', (data) => {
      this.showToast('Başarılı', 'Uygulama yüklendi', 'success');
      if (this.currentPage === 'apps') {
        this.loadApps();
      }
    });

    this.socket.on('system:update:complete', () => {
      this.showToast('Başarılı', 'Sistem güncellendi', 'success');
    });
  }

  setupEventListeners() {
    // Login form
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', () => {
      this.handleLogout();
    });

    // Navigation links
    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        this.navigateTo(page);
      });
    });

    // Domain form
    document.getElementById('addDomainForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddDomain(e.target);
    });

    // Mail form
    document.getElementById('addMailForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddMail(e.target);
    });

    // User form
    document.getElementById('addUserForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddUser(e.target);
    });

    // Install app form
    document.getElementById('installAppForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleInstallApp(e.target);
    });

    // System buttons
    document.getElementById('updateSystemBtn')?.addEventListener('click', () => this.updateSystem());
    document.getElementById('reloadNginxBtn')?.addEventListener('click', () => this.reloadNginx());
    document.getElementById('renewSSLBtn')?.addEventListener('click', () => this.renewSSL());
    document.getElementById('rebootBtn')?.addEventListener('click', () => this.reboot());

    // Log type change
    document.getElementById('logType')?.addEventListener('change', (e) => {
      this.loadLogs(e.target.value);
    });

    // Seed apps button
    document.getElementById('seedAppsBtn')?.addEventListener('click', () => this.seedApps());

    // Docker tabs
    document.querySelectorAll('#dockerTabs .nav-link').forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('#dockerTabs .nav-link').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        this.loadDockerTab(tab.dataset.tab);
      });
    });
  }

  showLogin() {
    document.getElementById('app').classList.add('d-none');
    const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
    loginModal.show();
  }

  showApp() {
    bootstrap.Modal.getInstance(document.getElementById('loginModal'))?.hide();
    document.getElementById('app').classList.remove('d-none');
    document.getElementById('userEmail').textContent = this.user.email;

    // Admin menüsünü göster/gizle
    if (this.user.role === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('d-none'));
    }
  }

  async handleLogin() {
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
      const data = await api.login(email, password);
      api.setToken(data.token);
      this.user = data.user;
      this.showApp();
      this.loadDashboard();
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.classList.remove('d-none');
    }
  }

  handleLogout() {
    api.setToken(null);
    this.user = null;
    location.reload();
  }

  navigateTo(page) {
    // Update navigation
    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
      link.classList.toggle('active', link.dataset.page === page);
    });

    // Show page
    document.querySelectorAll('.page').forEach(p => p.classList.add('d-none'));
    document.getElementById(`page-${page}`).classList.remove('d-none');

    this.currentPage = page;

    // Load page data
    switch (page) {
      case 'dashboard':
        this.loadDashboard();
        break;
      case 'domains':
        this.loadDomains();
        break;
      case 'mail':
        this.loadMail();
        break;
      case 'apps':
        this.loadApps();
        break;
      case 'docker':
        this.loadDockerTab('containers');
        break;
      case 'system':
        this.loadSystem();
        break;
      case 'users':
        this.loadUsers();
        break;
    }
  }

  // Dashboard
  async loadDashboard() {
    try {
      const [cpu, memory, disk, info, services, containers] = await Promise.all([
        api.getCPU(),
        api.getMemory(),
        api.getDisk(),
        api.getSystemInfo(),
        api.getServices(),
        api.getContainers()
      ]);

      document.getElementById('cpuUsage').textContent = 
        `${cpu.loadAverage['1min'].toFixed(2)}`;
      document.getElementById('memUsage').textContent = 
        `${memory.usedPercent}%`;
      document.getElementById('diskUsage').textContent = 
        disk.usedPercent || '-';
      document.getElementById('uptime').textContent = 
        this.formatUptime(info.uptime);

      // Services
      let servicesHtml = '';
      for (const [name, status] of Object.entries(services)) {
        servicesHtml += `
          <div class="service-item">
            <span class="service-name">${name}</span>
            <span class="service-status">
              <span class="status-dot ${status}"></span>
              ${status === 'running' ? 'Çalışıyor' : 'Durdu'}
            </span>
          </div>
        `;
      }
      document.getElementById('servicesList').innerHTML = servicesHtml || 'Servis bulunamadı';

      // Containers
      let containersHtml = '';
      containers.slice(0, 5).forEach(c => {
        const name = c.Names?.[0]?.replace('/', '') || c.Id.substring(0, 12);
        const status = c.State;
        containersHtml += `
          <div class="container-item">
            <span class="container-name">${name}</span>
            <span class="container-status badge ${status === 'running' ? 'bg-success' : 'bg-secondary'}">
              ${status}
            </span>
          </div>
        `;
      });
      document.getElementById('containersList').innerHTML = containersHtml || 'Container bulunamadı';

    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // Domains
  async loadDomains() {
    try {
      const domains = await api.getDomains();
      let html = '';
      
      domains.forEach(domain => {
        html += `
          <tr>
            <td><strong>${domain.name}</strong></td>
            <td>
              <span class="badge ${domain.sslEnabled ? 'bg-success' : 'bg-secondary'}">
                ${domain.sslEnabled ? 'Aktif' : 'Pasif'}
              </span>
            </td>
            <td>
              <span class="badge ${domain.dnsVerified ? 'bg-success' : 'bg-warning'}">
                ${domain.dnsVerified ? 'Doğrulandı' : 'Bekliyor'}
              </span>
            </td>
            <td>
              <span class="badge ${domain.status === 'active' ? 'bg-success' : 'bg-secondary'}">
                ${domain.status}
              </span>
            </td>
            <td class="action-btns">
              <button class="btn btn-sm btn-outline-primary" onclick="app.verifyDomain('${domain._id}')" title="DNS Doğrula">
                <i class="bi bi-check-lg"></i>
              </button>
              <button class="btn btn-sm btn-outline-success" onclick="app.setupSSL('${domain._id}')" title="SSL Kur">
                <i class="bi bi-shield-check"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger" onclick="app.deleteDomain('${domain._id}')" title="Sil">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });

      document.getElementById('domainsList').innerHTML = html || '<tr><td colspan="5" class="text-center">Domain bulunamadı</td></tr>';
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async handleAddDomain(form) {
    try {
      const formData = new FormData(form);
      await api.createDomain({ name: formData.get('name') });
      bootstrap.Modal.getInstance(document.getElementById('addDomainModal')).hide();
      form.reset();
      this.showToast('Başarılı', 'Domain eklendi', 'success');
      this.loadDomains();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async verifyDomain(id) {
    try {
      await api.verifyDomain(id);
      this.showToast('Başarılı', 'DNS doğrulandı', 'success');
      this.loadDomains();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async setupSSL(id) {
    try {
      await api.setupSSL(id);
      this.showToast('Başarılı', 'SSL kuruldu', 'success');
      this.loadDomains();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async deleteDomain(id) {
    if (!confirm('Bu domaini silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteDomain(id);
      this.showToast('Başarılı', 'Domain silindi', 'success');
      this.loadDomains();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // Mail
  async loadMail() {
    try {
      const [accounts, domains] = await Promise.all([
        api.getMailAccounts(),
        api.getDomains()
      ]);

      let html = '';
      accounts.forEach(account => {
        html += `
          <tr>
            <td><strong>${account.email}</strong></td>
            <td>${account.domain?.name || '-'}</td>
            <td>${account.quota} MB</td>
            <td>
              <span class="badge ${account.status === 'active' ? 'bg-success' : 'bg-secondary'}">
                ${account.status}
              </span>
            </td>
            <td class="action-btns">
              <button class="btn btn-sm btn-outline-danger" onclick="app.deleteMailAccount('${account._id}')">
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });

      document.getElementById('mailList').innerHTML = html || '<tr><td colspan="5" class="text-center">E-posta hesabı bulunamadı</td></tr>';

      // Domain select doldur
      const select = document.getElementById('mailDomainSelect');
      select.innerHTML = domains.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async handleAddMail(form) {
    try {
      const formData = new FormData(form);
      await api.createMailAccount({
        username: formData.get('username'),
        domainId: formData.get('domainId'),
        password: formData.get('password'),
        quota: parseInt(formData.get('quota'))
      });
      bootstrap.Modal.getInstance(document.getElementById('addMailModal')).hide();
      form.reset();
      this.showToast('Başarılı', 'E-posta hesabı oluşturuldu', 'success');
      this.loadMail();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async deleteMailAccount(id) {
    if (!confirm('Bu e-posta hesabını silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteMailAccount(id);
      this.showToast('Başarılı', 'E-posta hesabı silindi', 'success');
      this.loadMail();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // Apps
  async loadApps() {
    try {
      const [apps, domains] = await Promise.all([
        api.getApps(),
        api.getDomains()
      ]);

      let html = '';
      apps.forEach(app => {
        const iconClass = this.getAppIcon(app.category);
        html += `
          <div class="col-md-3 col-sm-6 mb-4">
            <div class="card app-card" onclick="app.showInstallModal('${app._id}', '${app.name}')">
              <div class="card-body">
                <i class="bi ${iconClass} app-icon"></i>
                <h6 class="app-name">${app.name}</h6>
                <span class="app-category">${app.category}</span>
              </div>
            </div>
          </div>
        `;
      });

      document.getElementById('appsList').innerHTML = html || '<div class="col-12 text-center">Uygulama bulunamadı</div>';

      // Domain select doldur
      const select = document.getElementById('appDomainSelect');
      select.innerHTML = domains.map(d => `<option value="${d._id}">${d.name}</option>`).join('');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  getAppIcon(category) {
    const icons = {
      productivity: 'bi-briefcase',
      communication: 'bi-chat-dots',
      development: 'bi-code-slash',
      media: 'bi-film',
      storage: 'bi-cloud',
      other: 'bi-grid'
    };
    return icons[category] || 'bi-grid';
  }

  showInstallModal(appId, appName) {
    document.getElementById('installAppId').value = appId;
    document.querySelector('#installAppModal .modal-title').textContent = `${appName} Yükle`;
    new bootstrap.Modal(document.getElementById('installAppModal')).show();
  }

  async handleInstallApp(form) {
    try {
      const formData = new FormData(form);
      const appId = formData.get('appId');
      
      await api.installApp(appId, {
        subdomain: formData.get('subdomain'),
        domainId: formData.get('domainId')
      });

      bootstrap.Modal.getInstance(document.getElementById('installAppModal')).hide();
      form.reset();
      this.showToast('Başarılı', 'Uygulama yükleme başlatıldı', 'success');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async seedApps() {
    try {
      await api.seedApps();
      this.showToast('Başarılı', 'Varsayılan uygulamalar yüklendi', 'success');
      this.loadApps();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // Docker
  async loadDockerTab(tab) {
    try {
      let html = '';
      
      switch (tab) {
        case 'containers':
          const containers = await api.getContainers();
          html = `
            <table class="table">
              <thead>
                <tr>
                  <th>İsim</th>
                  <th>Image</th>
                  <th>Durum</th>
                  <th>Portlar</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
          `;
          containers.forEach(c => {
            const name = c.Names?.[0]?.replace('/', '') || c.Id.substring(0, 12);
            const ports = c.Ports?.map(p => `${p.PublicPort || ''}:${p.PrivatePort}`).join(', ') || '-';
            html += `
              <tr>
                <td>${name}</td>
                <td>${c.Image}</td>
                <td><span class="badge ${c.State === 'running' ? 'bg-success' : 'bg-secondary'}">${c.State}</span></td>
                <td>${ports}</td>
                <td class="action-btns">
                  ${c.State !== 'running' ? 
                    `<button class="btn btn-sm btn-outline-success" onclick="app.startContainer('${c.Id}')"><i class="bi bi-play"></i></button>` :
                    `<button class="btn btn-sm btn-outline-warning" onclick="app.stopContainer('${c.Id}')"><i class="bi bi-stop"></i></button>`
                  }
                  <button class="btn btn-sm btn-outline-primary" onclick="app.restartContainer('${c.Id}')"><i class="bi bi-arrow-clockwise"></i></button>
                  <button class="btn btn-sm btn-outline-danger" onclick="app.deleteContainer('${c.Id}')"><i class="bi bi-trash"></i></button>
                </td>
              </tr>
            `;
          });
          html += '</tbody></table>';
          break;

        case 'images':
          const images = await api.getImages();
          html = `
            <table class="table">
              <thead>
                <tr>
                  <th>Repository</th>
                  <th>Tag</th>
                  <th>Boyut</th>
                  <th>Oluşturulma</th>
                </tr>
              </thead>
              <tbody>
          `;
          images.forEach(img => {
            const repoTag = img.RepoTags?.[0] || '<none>';
            const [repo, tag] = repoTag.split(':');
            const size = this.formatBytes(img.Size);
            const created = new Date(img.Created * 1000).toLocaleDateString('tr-TR');
            html += `
              <tr>
                <td>${repo}</td>
                <td>${tag}</td>
                <td>${size}</td>
                <td>${created}</td>
              </tr>
            `;
          });
          html += '</tbody></table>';
          break;

        case 'networks':
          const networks = await api.getNetworks();
          html = `
            <table class="table">
              <thead>
                <tr>
                  <th>İsim</th>
                  <th>Driver</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
          `;
          networks.forEach(net => {
            html += `
              <tr>
                <td>${net.Name}</td>
                <td>${net.Driver}</td>
                <td>${net.Scope}</td>
              </tr>
            `;
          });
          html += '</tbody></table>';
          break;

        case 'volumes':
          const volumes = await api.getVolumes();
          html = `
            <table class="table">
              <thead>
                <tr>
                  <th>İsim</th>
                  <th>Driver</th>
                  <th>Mountpoint</th>
                </tr>
              </thead>
              <tbody>
          `;
          (volumes.Volumes || []).forEach(vol => {
            html += `
              <tr>
                <td>${vol.Name}</td>
                <td>${vol.Driver}</td>
                <td><small>${vol.Mountpoint}</small></td>
              </tr>
            `;
          });
          html += '</tbody></table>';
          break;
      }

      document.getElementById('dockerContent').innerHTML = html;
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async startContainer(id) {
    try {
      await api.startContainer(id);
      this.showToast('Başarılı', 'Container başlatıldı', 'success');
      this.loadDockerTab('containers');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async stopContainer(id) {
    try {
      await api.stopContainer(id);
      this.showToast('Başarılı', 'Container durduruldu', 'success');
      this.loadDockerTab('containers');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async restartContainer(id) {
    try {
      await api.restartContainer(id);
      this.showToast('Başarılı', 'Container yeniden başlatıldı', 'success');
      this.loadDockerTab('containers');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async deleteContainer(id) {
    if (!confirm('Bu container\'ı silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteContainer(id);
      this.showToast('Başarılı', 'Container silindi', 'success');
      this.loadDockerTab('containers');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // System
  async loadSystem() {
    try {
      const info = await api.getSystemInfo();
      
      const html = `
        <table>
          <tr><td>Hostname</td><td>${info.hostname}</td></tr>
          <tr><td>Platform</td><td>${info.platform}</td></tr>
          <tr><td>Kernel</td><td>${info.release}</td></tr>
          <tr><td>Mimari</td><td>${info.arch}</td></tr>
          <tr><td>CPU Sayısı</td><td>${info.cpus}</td></tr>
          <tr><td>Toplam RAM</td><td>${this.formatBytes(info.totalmem)}</td></tr>
          <tr><td>Boş RAM</td><td>${this.formatBytes(info.freemem)}</td></tr>
          <tr><td>Uptime</td><td>${this.formatUptime(info.uptime)}</td></tr>
        </table>
      `;

      document.getElementById('systemInfo').innerHTML = html;
      this.loadLogs('system');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async loadLogs(type) {
    try {
      const data = await api.getLogs(type);
      document.getElementById('logContent').textContent = data.logs || 'Log bulunamadı';
    } catch (error) {
      document.getElementById('logContent').textContent = 'Log yüklenemedi: ' + error.message;
    }
  }

  async updateSystem() {
    if (!confirm('Sistem güncellemesi başlatılsın mı?')) return;
    try {
      await api.updateSystem();
      this.showToast('Bilgi', 'Sistem güncelleme başlatıldı', 'info');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async reloadNginx() {
    try {
      await api.reloadNginx();
      this.showToast('Başarılı', 'Nginx yeniden yüklendi', 'success');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async renewSSL() {
    try {
      await api.renewSSL();
      this.showToast('Başarılı', 'SSL sertifikaları yenilendi', 'success');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async reboot() {
    if (!confirm('Sistemi yeniden başlatmak istediğinize emin misiniz?')) return;
    try {
      await api.reboot();
      this.showToast('Bilgi', 'Sistem yeniden başlatılıyor...', 'warning');
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // Users
  async loadUsers() {
    try {
      const users = await api.getUsers();
      let html = '';

      users.forEach(user => {
        html += `
          <tr>
            <td>${user.email}</td>
            <td>${user.name || '-'}</td>
            <td><span class="badge ${user.role === 'admin' ? 'bg-danger' : 'bg-primary'}">${user.role}</span></td>
            <td><span class="badge ${user.isActive ? 'bg-success' : 'bg-secondary'}">${user.isActive ? 'Aktif' : 'Pasif'}</span></td>
            <td class="action-btns">
              <button class="btn btn-sm btn-outline-danger" onclick="app.deleteUser('${user._id}')" ${user._id === this.user._id ? 'disabled' : ''}>
                <i class="bi bi-trash"></i>
              </button>
            </td>
          </tr>
        `;
      });

      document.getElementById('usersList').innerHTML = html || '<tr><td colspan="5" class="text-center">Kullanıcı bulunamadı</td></tr>';
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async handleAddUser(form) {
    try {
      const formData = new FormData(form);
      await api.createUser({
        email: formData.get('email'),
        password: formData.get('password'),
        name: formData.get('name'),
        role: formData.get('role')
      });
      bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
      form.reset();
      this.showToast('Başarılı', 'Kullanıcı oluşturuldu', 'success');
      this.loadUsers();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  async deleteUser(id) {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
    try {
      await api.deleteUser(id);
      this.showToast('Başarılı', 'Kullanıcı silindi', 'success');
      this.loadUsers();
    } catch (error) {
      this.showToast('Hata', error.message, 'danger');
    }
  }

  // Utilities
  formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    let result = '';
    if (days > 0) result += `${days}g `;
    if (hours > 0) result += `${hours}s `;
    result += `${minutes}d`;
    
    return result;
  }

  showToast(title, message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastTitle = document.getElementById('toastTitle');
    const toastBody = document.getElementById('toastBody');

    toast.className = `toast bg-${type} text-white`;
    toastTitle.textContent = title;
    toastBody.textContent = message;

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
  }
}

// Initialize app
const app = new App();
