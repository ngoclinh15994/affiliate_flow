const discoveryButton = document.getElementById('runDiscoveryButton');
const statusEl = document.getElementById('status');
const fieldsContainer = document.getElementById('fields');

function setStatus(text, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = text || '';
  statusEl.style.color = isError ? '#b91c1c' : '#6b7280';
}

function createFieldRow(fieldKey, selectorText) {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.alignItems = 'center';
  row.style.justifyContent = 'space-between';
  row.style.gap = '6px';
  row.style.marginBottom = '6px';

  const label = document.createElement('div');
  label.style.flex = '1 1 auto';
  label.style.fontSize = '12px';
  label.textContent = fieldKey;

  const selectorEl = document.createElement('div');
  selectorEl.style.flex = '2 1 auto';
  selectorEl.style.fontSize = '11px';
  selectorEl.style.color = '#6b7280';
  selectorEl.style.overflow = 'hidden';
  selectorEl.style.textOverflow = 'ellipsis';
  selectorEl.style.whiteSpace = 'nowrap';
  selectorEl.textContent = selectorText || '(chưa có selector)';

  const button = document.createElement('button');
  button.textContent = 'Reselect';
  button.style.flex = '0 0 auto';

  button.addEventListener('click', async () => {
    button.disabled = true;
    setStatus(`Đang chọn lại selector cho ${fieldKey}...`);

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        setStatus('Không tìm thấy tab đang mở trang Chợ Tốt.', true);
        button.disabled = false;
        return;
      }

      chrome.tabs.sendMessage(
        activeTab.id,
        { type: 'START_RESELECT', fieldKey },
        (response) => {
          if (chrome.runtime.lastError) {
            setStatus(
              'Lỗi khi gửi yêu cầu reselect tới content script. Xem console để biết chi tiết.',
              true
            );
            button.disabled = false;
            return;
          }

          if (response && response.ok && response.selector) {
            selectorEl.textContent = response.selector;
            setStatus(`Đã cập nhật selector cho ${fieldKey}.`);
          } else if (response && response.cancelled) {
            setStatus(`Đã huỷ chọn lại selector cho ${fieldKey}.`);
          } else {
            setStatus(
              `Không nhận được selector hợp lệ cho ${fieldKey}.`,
              true
            );
          }

          button.disabled = false;
        }
      );
    } catch (e) {
      setStatus('Lỗi không xác định khi thực hiện reselect.', true);
      button.disabled = false;
    }
  });

  row.appendChild(label);
  row.appendChild(selectorEl);
  row.appendChild(button);
  return row;
}

function renderFields(state) {
  if (!fieldsContainer) return;
  fieldsContainer.innerHTML = '';

  const fieldKeys = (state && state.fieldKeys) || [];
  const dynamicSelectors = (state && state.dynamicSelectors) || {};

  fieldKeys.forEach((key) => {
    const selectorText = dynamicSelectors[key] || '';
    const row = createFieldRow(key, selectorText);
    fieldsContainer.appendChild(row);
  });
}

function loadInitialState() {
  chrome.runtime.sendMessage({ type: 'GET_CURRENT_SELECTORS' }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus(
        'Không lấy được thông tin selector hiện tại. Xem console để biết chi tiết.',
        true
      );
      return;
    }

    if (response && response.fieldKeys) {
      renderFields(response);
    }
  });
}

if (discoveryButton) {
  discoveryButton.addEventListener('click', () => {
    discoveryButton.disabled = true;
    setStatus('Đang chạy selector discovery...');

    chrome.runtime.sendMessage(
      { type: 'RUN_PRODUCT_SELECTOR_DISCOVERY_NOW' },
      (response) => {
        if (chrome.runtime.lastError) {
          setStatus(
            'Lỗi khi chạy selector discovery. Xem console để biết chi tiết.',
            true
          );
          discoveryButton.disabled = false;
          return;
        }

        if (response && response.ok) {
          setStatus('Đã chạy selector discovery. Xem log để xem chi tiết.');
          if (response.dynamicSelectors) {
            renderFields({
              fieldKeys: response.fieldKeys || [],
              dynamicSelectors: response.dynamicSelectors
            });
          }
        } else {
          setStatus(
            'Selector discovery không trả về kết quả. Kiểm tra cấu hình mẫu.',
            true
          );
        }

        discoveryButton.disabled = false;
      }
    );
  });
}

loadInitialState();
