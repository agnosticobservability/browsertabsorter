document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadTabs);
    }
    loadTabs();
});
async function loadTabs() {
    const tabs = await chrome.tabs.query({});
    const tbody = document.querySelector('#tabsTable tbody');
    const totalTabsEl = document.getElementById('totalTabs');
    if (totalTabsEl) {
        totalTabsEl.textContent = tabs.length.toString();
    }
    if (tbody) {
        tbody.innerHTML = ''; // Clear existing rows
        tabs.forEach(tab => {
            const row = document.createElement('tr');
            row.innerHTML = `
        <td>${tab.id ?? 'N/A'}</td>
        <td>${tab.index}</td>
        <td>${tab.windowId}</td>
        <td>${tab.groupId}</td>
        <td class="title-cell" title="${escapeHtml(tab.title || '')}">${escapeHtml(tab.title || '')}</td>
        <td class="url-cell" title="${escapeHtml(tab.url || '')}">${escapeHtml(tab.url || '')}</td>
        <td>${tab.status}</td>
        <td>${tab.active ? 'Yes' : 'No'}</td>
        <td>${tab.pinned ? 'Yes' : 'No'}</td>
        <td>${tab.openerTabId ?? '-'}</td>
        <td>${new Date(tab.lastAccessed || 0).toLocaleString()}</td>
      `;
            tbody.appendChild(row);
        });
    }
}
function escapeHtml(text) {
    if (!text)
        return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
export {};
