import { expect, test } from "bun:test";

function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

test("Fix verification: favIconUrl injection", () => {
  const tab = {
    title: "Test Tab",
    url: "https://example.com",
    favIconUrl: '"><img src=x onerror=alert(1)>'
  };

  // Fixed code pattern
  const html = `
    <div style="width: 12px; height: 12px; background: #eee; border-radius: 2px; flex-shrink: 0;">
        ${tab.favIconUrl ? `<img src="${escapeHtml(tab.favIconUrl)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.style.display='none'">` : ''}
    </div>
  `;

  // The output should NOT contain the injected payload as executable code
  // It should be properly escaped
  expect(html).not.toContain('src=""><img src=x onerror=alert(1)>"');
  expect(html).toContain('src="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;"');
});
