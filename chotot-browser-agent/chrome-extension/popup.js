const button = document.getElementById('runDiscoveryButton');
const statusEl = document.getElementById('status');

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.color = isError ? '#b91c1c' : '#6b7280';
}

if (button) {
  button.addEventListener('click', () => {
    button.disabled = true;
    setStatus('Đang chạy selector discovery...');

    chrome.runtime.sendMessage(
      { type: 'RUN_PRODUCT_SELECTOR_DISCOVERY_NOW' },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus(
            'Lỗi khi chạy selector discovery. Xem console để biết chi tiết.',
            true
          );
          button.disabled = false;
          return;
        }

        if (response && response.ok) {
          setStatus('Đã chạy selector discovery. Xem log để xem chi tiết.');
        } else {
          setStatus(
            'Selector discovery không trả về kết quả. Kiểm tra cấu hình mẫu.',
            true
          );
        }

        button.disabled = false;
      }
    );
  });
}

