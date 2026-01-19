// Luma 참가자 목록 확장 프로그램
(function() {
  'use strict';

  // 이미 로드되었는지 확인
  if (window.__lumaParticipantsLoaded) return;
  window.__lumaParticipantsLoaded = true;

  // UI 텍스트 (한국어)
  const UI_TEXT = {
    buttonLabel: '참가자',
    modalTitle: '참가자 목록',
    copy: '복사',
    download: 'CSV 다운로드',
    loading: '불러오는 중...',
    copied: '복사되었습니다!',
    error: '오류가 발생했습니다',
    noParticipants: '참가자가 없습니다',
    close: '닫기',
    headers: {
      name: '이름',
      twitter: '트위터',
      linkedin: '링크드인',
      instagram: '인스타그램',
      bio: '소개'
    }
  };

  // 페이지에서 이벤트 정보 추출
  function extractEventInfo() {
    // URL에서 ticket_key 추출
    const urlParams = new URLSearchParams(window.location.search);
    const ticketKey = urlParams.get('tk');

    // event_api_id 추출 시도
    let eventApiId = null;

    // 방법 1: __NEXT_DATA__ 에서 추출
    const nextDataScript = document.getElementById('__NEXT_DATA__');
    if (nextDataScript) {
      try {
        const data = JSON.parse(nextDataScript.textContent);
        // Next.js 데이터 구조에서 event api_id 찾기
        if (data?.props?.pageProps?.event?.api_id) {
          eventApiId = data.props.pageProps.event.api_id;
        } else if (data?.props?.pageProps?.initialData?.event?.api_id) {
          eventApiId = data.props.pageProps.initialData.event.api_id;
        }
      } catch (e) {
        console.log('__NEXT_DATA__ 파싱 실패:', e);
      }
    }

    // 방법 2: 페이지 HTML에서 evt- 패턴 찾기
    if (!eventApiId) {
      const pageHtml = document.documentElement.innerHTML;
      const evtMatch = pageHtml.match(/"api_id"\s*:\s*"(evt-[^"]+)"/);
      if (evtMatch) {
        eventApiId = evtMatch[1];
      }
    }

    // 방법 3: 스크립트 태그들에서 찾기
    if (!eventApiId) {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const match = script.textContent.match(/evt-[A-Za-z0-9]+/);
        if (match) {
          eventApiId = match[0];
          break;
        }
      }
    }

    return { eventApiId, ticketKey };
  }

  // API 베이스 URL 결정 (lu.ma 또는 luma.com)
  function getApiBaseUrl() {
    if (window.location.hostname === 'lu.ma') {
      return 'https://api.lu.ma';
    }
    return 'https://api2.luma.com';
  }

  // API에서 참가자 목록 가져오기
  async function fetchParticipants(eventApiId, ticketKey) {
    const participants = [];
    let cursor = null;
    let hasMore = true;
    const apiBase = getApiBaseUrl();

    while (hasMore) {
      let url = `${apiBase}/event/get-guest-list?event_api_id=${eventApiId}&pagination_limit=100`;
      if (ticketKey) {
        url += `&ticket_key=${ticketKey}`;
      }
      if (cursor) {
        url += `&pagination_cursor=${encodeURIComponent(cursor)}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': '*/*',
          'x-luma-client-type': 'luma-web',
          'x-luma-web-url': window.location.href
        }
      });

      if (!response.ok) {
        throw new Error(`API 오류: ${response.status}`);
      }

      const data = await response.json();

      if (data.entries) {
        participants.push(...data.entries);
      }

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    return participants;
  }

  // 참가자 데이터를 테이블 행으로 변환
  function formatParticipant(entry) {
    const user = entry.user || {};
    return {
      name: user.name || '-',
      twitter: user.twitter_handle ? `@${user.twitter_handle}` : '-',
      linkedin: user.linkedin_handle || '-',
      instagram: user.instagram_handle ? `@${user.instagram_handle}` : '-',
      bio: user.bio_short || '-'
    };
  }

  // CSV 문자열 생성
  function generateCSV(participants) {
    const headers = ['이름', '트위터', '링크드인', '인스타그램', '소개'];
    const rows = participants.map(entry => {
      const p = formatParticipant(entry);
      return [p.name, p.twitter, p.linkedin, p.instagram, p.bio]
        .map(cell => `"${(cell || '').replace(/"/g, '""')}"`)
        .join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  // CSV 다운로드
  function downloadCSV(participants, eventApiId) {
    const csv = generateCSV(participants);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `luma-participants-${eventApiId || 'export'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 클립보드에 복사
  async function copyToClipboard(participants) {
    const text = participants.map(entry => {
      const p = formatParticipant(entry);
      return `${p.name}\t${p.twitter}\t${p.linkedin}\t${p.instagram}\t${p.bio}`;
    }).join('\n');

    const headers = '이름\t트위터\t링크드인\t인스타그램\t소개\n';
    await navigator.clipboard.writeText(headers + text);
  }

  // 플로팅 버튼 생성
  function createFloatingButton() {
    const button = document.createElement('button');
    button.id = 'luma-participants-btn';
    button.innerHTML = '👥';
    button.title = UI_TEXT.buttonLabel;
    button.addEventListener('click', openModal);
    document.body.appendChild(button);
    return button;
  }

  // 모달 생성
  function createModal() {
    const overlay = document.createElement('div');
    overlay.id = 'luma-participants-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    const modal = document.createElement('div');
    modal.id = 'luma-participants-modal';

    modal.innerHTML = `
      <div class="luma-modal-header">
        <h2 class="luma-modal-title">${UI_TEXT.modalTitle}</h2>
        <button class="luma-modal-close" aria-label="${UI_TEXT.close}">&times;</button>
      </div>
      <div class="luma-modal-actions">
        <button class="luma-btn luma-btn-copy">📋 ${UI_TEXT.copy}</button>
        <button class="luma-btn luma-btn-download">💾 ${UI_TEXT.download}</button>
      </div>
      <div class="luma-modal-content">
        <div class="luma-loading">${UI_TEXT.loading}</div>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // 이벤트 리스너
    modal.querySelector('.luma-modal-close').addEventListener('click', closeModal);

    return { overlay, modal };
  }

  // 모달 열기
  async function openModal() {
    let { overlay, modal } = document.getElementById('luma-participants-overlay')
      ? { overlay: document.getElementById('luma-participants-overlay'), modal: document.getElementById('luma-participants-modal') }
      : createModal();

    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    const content = modal.querySelector('.luma-modal-content');
    const title = modal.querySelector('.luma-modal-title');
    content.innerHTML = `<div class="luma-loading">${UI_TEXT.loading}</div>`;

    try {
      const { eventApiId, ticketKey } = extractEventInfo();

      if (!eventApiId) {
        content.innerHTML = `<div class="luma-error">이벤트 ID를 찾을 수 없습니다. 이벤트 페이지에서 실행해주세요.</div>`;
        return;
      }

      const participants = await fetchParticipants(eventApiId, ticketKey);

      if (participants.length === 0) {
        content.innerHTML = `<div class="luma-empty">${UI_TEXT.noParticipants}</div>`;
        return;
      }

      title.textContent = `${UI_TEXT.modalTitle} (${participants.length}명)`;

      // 테이블 생성
      const table = document.createElement('table');
      table.className = 'luma-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>${UI_TEXT.headers.name}</th>
            <th>${UI_TEXT.headers.twitter}</th>
            <th>${UI_TEXT.headers.linkedin}</th>
            <th>${UI_TEXT.headers.instagram}</th>
            <th>${UI_TEXT.headers.bio}</th>
          </tr>
        </thead>
        <tbody>
          ${participants.map(entry => {
            const p = formatParticipant(entry);
            return `
              <tr>
                <td>${escapeHtml(p.name)}</td>
                <td>${p.twitter !== '-' ? `<a href="https://twitter.com/${p.twitter.replace('@', '')}" target="_blank">${escapeHtml(p.twitter)}</a>` : '-'}</td>
                <td>${p.linkedin !== '-' ? `<a href="https://linkedin.com${p.linkedin}" target="_blank">${escapeHtml(p.linkedin)}</a>` : '-'}</td>
                <td>${p.instagram !== '-' ? `<a href="https://instagram.com/${p.instagram.replace('@', '')}" target="_blank">${escapeHtml(p.instagram)}</a>` : '-'}</td>
                <td class="luma-bio-cell">${escapeHtml(p.bio)}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      `;

      content.innerHTML = '';
      content.appendChild(table);

      // 버튼 이벤트
      modal.querySelector('.luma-btn-copy').onclick = async () => {
        await copyToClipboard(participants);
        showToast(UI_TEXT.copied);
      };

      modal.querySelector('.luma-btn-download').onclick = () => {
        downloadCSV(participants, eventApiId);
      };

    } catch (error) {
      console.error('참가자 목록 로드 실패:', error);
      content.innerHTML = `<div class="luma-error">${UI_TEXT.error}: ${error.message}</div>`;
    }
  }

  // 모달 닫기
  function closeModal() {
    const overlay = document.getElementById('luma-participants-overlay');
    if (overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  // 토스트 메시지
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'luma-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  // HTML 이스케이프
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ESC 키로 모달 닫기
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // 초기화
  createFloatingButton();
})();
