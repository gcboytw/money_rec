/**
     * App State
     */
    const state = {
      currentType: 'expense', // 'expense' | 'income' | 'transfer'
      selectedDate: getTodayString(),
      selectedAccount: null,
      transferTargetAccount: null,
      accountModalTarget: 'source',
      selectedParentCategory: null,
      selectedSubCategory: null,
      calcExpression: '0',
      allCategories: [],
      allAccounts: [],
      todayRecords: [],
      categoryManageType: 'expense',
      categoryFormLevel: 'parent', // 'parent' | 'sub'
      chartInstance: null,
      annualBarChartInstance: null,
      annualPieChartInstance: null,
      reportTab: 'month',
      reportYear: new Date().getFullYear(),
      reportMonth: new Date().getMonth() + 1,
      reportExpandedCatId: null,
      reportBudgetExpanded: false,
      annualBarMetric: 'expense',
      pendingImportJSON: null,
      editRecordType: 'expense',
      recurringFormType: 'expense',
      isReady: false,
      gasUrl: localStorage.getItem('pocket_ledger_gas_url') || '',
      gasAutoSync: localStorage.getItem('pocket_ledger_gas_auto_sync') === 'true',
      hasUnsyncedChanges: false,
      isSyncing: false,
      syncTimer: null,
      lastSyncTime: localStorage.getItem('pocket_ledger_gas_last_sync') || ''
    };

    function getTodayString() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    /**
     * Date & Week Helper Functions
     */
    function getWeekDaysForDate(dateStr) {
      const target = new Date(dateStr + 'T00:00:00');
      const dayOfWeek = target.getDay();
      const distToMonday = (dayOfWeek + 6) % 7;
      const monday = new Date(target);
      monday.setDate(target.getDate() - distToMonday);

      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dt = String(d.getDate()).padStart(2, '0');
        days.push({
          dateStr: `${y}-${m}-${dt}`,
          dayNum: d.getDate(),
          dayName: ['週一', '週二', '週三', '週四', '週五', '週六', '週日'][i],
          month: d.getMonth() + 1,
          year: y
        });
      }
      return days;
    }

    /**
     * Initialize App
     */
    async function initApp() {
      try {
        await initDatabaseSeeds();
        await checkAndApplyRecurring();
        await loadAllData();
        setupDefaultSelections();
        renderWeekStripCalendar();
        renderSubCategoryQuickPills();
        await renderTodayRecords();
        initGasSyncModule();
        setupDexieChangeHooks();
        setupWeekStripGestures();
        state.isReady = true;
        lucide.createIcons();
      } catch (err) {
        console.error('App init error:', err);
        showToast('初始化失敗', 'error');
      }
    }


    async function loadAllData() {
      state.allCategories = await db.categories.toArray();
      state.allAccounts = await db.accounts.toArray();
    }

    function setupDefaultSelections() {
      const defAcc = state.allAccounts.find(a => a.isDefault && !a.isArchived) || state.allAccounts.find(a => !a.isArchived);
      if (defAcc) setSelectedAccount(defAcc);

      const targetAcc = state.allAccounts.find(a => a.id !== defAcc?.id && !a.isArchived) || state.allAccounts[1];
      if (targetAcc) setTransferTargetAccount(targetAcc);

      const expCats = state.allCategories.filter(c => c.type === 'expense' && c.parentId === null && !c.isArchived);
      if (expCats.length > 0) {
        setSelectedParentCategory(expCats[0]);
      }
    }

    /**
     * Week Strip Calendar Rendering with 3-Panel Virtual Track
     */
    function generateWeekDaysHTML(weekDays, selectedDateStr, todayStr, recordDatesSet) {
      return weekDays.map(item => {
        const isSelected = item.dateStr === selectedDateStr;
        const isToday = item.dateStr === todayStr;
        const isFuture = item.dateStr > todayStr;
        const hasRecord = recordDatesSet.has(item.dateStr);

        const titleClass = isSelected ? 'text-zinc-100 font-extrabold' : 'text-zinc-400 font-bold';

        let numBoxClass = 'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mx-auto transition-all';
        if (isSelected) {
          numBoxClass += ' bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20 font-black scale-105';
        } else if (isToday) {
          numBoxClass += ' text-amber-400 font-extrabold';
        } else if (isFuture) {
          numBoxClass += ' text-zinc-600';
        } else {
          numBoxClass += ' text-zinc-300 hover:text-zinc-100';
        }

        let dotHtml = '<div class="w-1.5 h-1.5 mt-1 rounded-full mx-auto opacity-0"></div>';
        if (hasRecord) {
          dotHtml = `<div class="w-1.5 h-1.5 mt-1 rounded-full bg-amber-500 mx-auto shadow-sm"></div>`;
        }

        return `
          <button onclick="selectDate('${item.dateStr}')" class="tap-scale flex flex-col items-center py-1 rounded-xl transition-all ${isSelected ? 'bg-zinc-800/40' : 'hover:bg-zinc-800/20'}">
            <span class="text-xs mb-1 ${titleClass}">${item.dayName}</span>
            <div class="${numBoxClass}">${item.dayNum}</div>
            ${dotHtml}
          </button>
        `;
      }).join('');
    }

    function getOffsetDateString(baseDateStr, dayOffset) {
      const d = new Date(baseDateStr + 'T00:00:00');
      d.setDate(d.getDate() + dayOffset);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dt}`;
    }

    let isWeekCarouselAnimating = false;

    async function renderWeekStripCalendar() {
      const titleEl = document.getElementById('calendar-header-title');
      const pickerInput = document.getElementById('input-date-picker');
      const todayStr = getTodayString();

      if (pickerInput) {
        pickerInput.value = state.selectedDate;
        pickerInput.max = todayStr;
      }

      const selectedD = new Date(state.selectedDate + 'T00:00:00');
      if (titleEl) {
        titleEl.textContent = `${selectedD.getFullYear()}年 ${selectedD.getMonth() + 1}月`;
      }

      const listLabel = document.getElementById('list-date-label');
      if (listLabel) {
        if (state.selectedDate === todayStr) {
          listLabel.textContent = '本日明細';
        } else {
          listLabel.textContent = `${selectedD.getMonth() + 1}月${selectedD.getDate()}日 明細`;
        }
      }

      // 計算三週（上一週、當前週、下一週）
      const prevDateStr = getOffsetDateString(state.selectedDate, -7);
      const nextDateStr = getOffsetDateString(state.selectedDate, +7);

      const currWeekDays = getWeekDaysForDate(state.selectedDate);
      const prevWeekDays = getWeekDaysForDate(prevDateStr);
      const nextWeekDays = getWeekDaysForDate(nextDateStr);

      const startDateRange = prevWeekDays[0].dateStr;
      const endDateRange = nextWeekDays[6].dateStr;

      // 一次性批次查詢三週的所有記帳紀錄
      const rangeRecords = await db.records.where('date').between(startDateRange, endDateRange, true, true).toArray();
      const recordDatesSet = new Set(rangeRecords.map(r => r.date));

      const panelPrev = document.getElementById('week-panel-prev');
      const panelCurr = document.getElementById('week-panel-curr');
      const panelNext = document.getElementById('week-panel-next');
      const track = document.getElementById('week-carousel-track');

      if (panelPrev) panelPrev.innerHTML = generateWeekDaysHTML(prevWeekDays, state.selectedDate, todayStr, recordDatesSet);
      if (panelCurr) panelCurr.innerHTML = generateWeekDaysHTML(currWeekDays, state.selectedDate, todayStr, recordDatesSet);
      if (panelNext) panelNext.innerHTML = generateWeekDaysHTML(nextWeekDays, state.selectedDate, todayStr, recordDatesSet);

      // 重置 track 位置至中央 panel (無動畫瞬間定位)
      if (track) {
        track.style.transition = 'none';
        track.style.transform = 'translateX(-33.333333%)';
      }
    }

    async function selectDate(dateStr) {
      state.selectedDate = dateStr;
      await renderWeekStripCalendar();
      await renderTodayRecords();
    }

    async function goToToday() {
      const today = getTodayString();
      await selectDate(today);
      showToast('已切換至今天', 'info');
    }

    async function changeWeek(offset, animated = true) {
      if (!offset || isWeekCarouselAnimating) return;
      const todayStr = getTodayString();
      const targetDateStr = getOffsetDateString(state.selectedDate, offset * 7);

      // 如果切換到未來週，且該週的週一已經超過今天，則提示並阻止
      if (offset > 0) {
        const targetWeekDays = getWeekDaysForDate(targetDateStr);
        const mondayStr = targetWeekDays[0].dateStr;
        if (mondayStr > todayStr) {
          showToast('已是最新一週囉', 'info');
          const track = document.getElementById('week-carousel-track');
          if (track) {
            track.style.transition = 'transform 0.15s ease-out';
            track.style.transform = 'translateX(-36%)';
            setTimeout(() => {
              track.style.transition = 'transform 0.2s ease-out';
              track.style.transform = 'translateX(-33.333333%)';
            }, 150);
          }
          return;
        }
      }

      let finalDateStr = targetDateStr;
      if (offset > 0 && targetDateStr > todayStr) {
        finalDateStr = todayStr;
      }

      const track = document.getElementById('week-carousel-track');
      if (animated && track) {
        isWeekCarouselAnimating = true;
        const targetPercent = offset > 0 ? -66.666666 : 0;
        track.style.transition = 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
        track.style.transform = `translateX(${targetPercent}%)`;

        const onTransitionEnd = async () => {
          track.removeEventListener('transitionend', onTransitionEnd);
          state.selectedDate = finalDateStr;
          await renderWeekStripCalendar();
          await renderTodayRecords();
          isWeekCarouselAnimating = false;
        };
        track.addEventListener('transitionend', onTransitionEnd);
      } else {
        state.selectedDate = finalDateStr;
        await renderWeekStripCalendar();
        await renderTodayRecords();
      }
    }

    function setupWeekStripGestures() {
      const viewport = document.getElementById('week-carousel-viewport');
      const track = document.getElementById('week-carousel-track');
      if (!viewport || !track) return;

      let startX = 0;
      let startY = 0;
      let startTime = 0;
      let isTracking = false;
      let isHorizontal = null; // null: 尚未判定, true: 水平滑動, false: 垂直捲動
      let deltaX = 0;

      viewport.addEventListener('touchstart', (e) => {
        if (isWeekCarouselAnimating || !e.touches || e.touches.length === 0) return;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
        isTracking = true;
        isHorizontal = null;
        deltaX = 0;
        track.style.transition = 'none';
      }, { passive: true });

      viewport.addEventListener('touchmove', (e) => {
        if (!isTracking || !e.touches || e.touches.length === 0) return;
        const curX = e.touches[0].clientX;
        const curY = e.touches[0].clientY;
        const diffX = curX - startX;
        const diffY = curY - startY;

        // 判定滑動意圖方向 (水平 vs 垂直)
        if (isHorizontal === null) {
          if (Math.abs(diffY) > 8 && Math.abs(diffY) >= Math.abs(diffX)) {
            // 使用者在垂直滑動瀏覽明細，放棄水平輪播
            isHorizontal = false;
            return;
          } else if (Math.abs(diffX) > 8 && Math.abs(diffX) > Math.abs(diffY)) {
            // 使用者在水平滑動週曆
            isHorizontal = true;
          } else {
            return;
          }
        }

        if (!isHorizontal) return;

        deltaX = diffX;
        const viewportWidth = viewport.offsetWidth || 360;
        const todayStr = getTodayString();
        const nextWeekMonday = getWeekDaysForDate(getOffsetDateString(state.selectedDate, 7))[0].dateStr;

        // 邊界阻尼感：若向左拉但下一週超過今天，加入橡皮筋阻尼反饋
        let effectiveDeltaX = deltaX;
        if (deltaX < 0 && nextWeekMonday > todayStr) {
          effectiveDeltaX = deltaX * 0.22;
        }

        // 1:1 即時跟隨手指移動 (GPU 加速)
        const percentOffset = -33.333333 + (effectiveDeltaX / viewportWidth) * 33.333333;
        track.style.transform = `translateX(${percentOffset}%)`;
      }, { passive: true });

      const handleTouchEnd = () => {
        if (!isTracking) return;
        isTracking = false;

        if (!isHorizontal) return;

        const viewportWidth = viewport.offsetWidth || 360;
        const elapsed = Math.max(Date.now() - startTime, 1);
        const velocityX = deltaX / elapsed; // px/ms
        const todayStr = getTodayString();
        const nextWeekMonday = getWeekDaysForDate(getOffsetDateString(state.selectedDate, 7))[0].dateStr;

        // 判定切換門檻：位移超過 20% 容器寬，或是手勢快甩 (速度 > 0.3px/ms 且位移 > 25px)
        const swipeNextThreshold = deltaX < -viewportWidth * 0.2 || (velocityX < -0.3 && deltaX < -25);
        const swipePrevThreshold = deltaX > viewportWidth * 0.2 || (velocityX > 0.3 && deltaX > 25);

        if (swipeNextThreshold) {
          if (nextWeekMonday > todayStr) {
            showToast('已是最新一週囉', 'info');
            snapBack();
          } else {
            animateToWeek(1);
          }
        } else if (swipePrevThreshold) {
          animateToWeek(-1);
        } else {
          snapBack();
        }
      };

      function snapBack() {
        track.style.transition = 'transform 0.22s cubic-bezier(0.25, 1, 0.5, 1)';
        track.style.transform = 'translateX(-33.333333%)';
      }

      function animateToWeek(offset) {
        isWeekCarouselAnimating = true;
        const targetPercent = offset > 0 ? -66.666666 : 0;
        track.style.transition = 'transform 0.26s cubic-bezier(0.25, 1, 0.5, 1)';
        track.style.transform = `translateX(${targetPercent}%)`;

        const onTransitionEnd = async () => {
          track.removeEventListener('transitionend', onTransitionEnd);
          const targetDateStr = getOffsetDateString(state.selectedDate, offset * 7);
          const todayStr = getTodayString();
          let finalDateStr = targetDateStr;
          if (offset > 0 && targetDateStr > todayStr) {
            finalDateStr = todayStr;
          }
          state.selectedDate = finalDateStr;
          await renderWeekStripCalendar();
          await renderTodayRecords();
          isWeekCarouselAnimating = false;
        };
        track.addEventListener('transitionend', onTransitionEnd);
      }

      viewport.addEventListener('touchend', handleTouchEnd, { passive: true });
      viewport.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    }

    async function onDatePickerChanged(val) {
      if (!val) return;
      const today = getTodayString();
      if (val > today) {
        showToast('不允許選擇未來日期', 'error');
        const picker = document.getElementById('input-date-picker');
        if (picker) picker.value = state.selectedDate;
        return;
      }
      await selectDate(val);
    }

    /**
     * Switch Transaction Type (Expense / Income / Transfer)
     */
    function switchType(type) {
      state.currentType = type;
      const expBtn = document.getElementById('tab-expense');
      const incBtn = document.getElementById('tab-income');
      const traBtn = document.getElementById('tab-transfer');
      const stdRow = document.getElementById('selector-row-standard');
      const traRow = document.getElementById('selector-row-transfer');
      const quickSubCat = document.getElementById('quick-subcategory-container');
      const typeSymbol = document.getElementById('card-type-symbol');
      const amountDisp = document.getElementById('card-display-amount');
      const submitBtn = document.getElementById('btn-quick-submit');

      expBtn.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-zinc-400 hover:text-zinc-200';
      incBtn.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-zinc-400 hover:text-zinc-200';
      traBtn.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all text-zinc-400 hover:text-zinc-200';

      if (type === 'expense') {
        expBtn.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all bg-amber-500 text-zinc-950 shadow-md';
        stdRow.classList.remove('hidden');
        quickSubCat?.classList.remove('hidden');
        traRow.classList.add('hidden');
        typeSymbol.className = 'text-amber-400 font-bold text-xs';
        typeSymbol.textContent = 'NT$';
        amountDisp.className = 'text-xl sm:text-2xl font-black font-mono tracking-tight text-amber-400 truncate';
        submitBtn.className = 'tap-scale px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-zinc-950 font-bold text-xs flex items-center gap-1 shadow-lg shadow-amber-500/20';
        submitBtn.querySelector('span').textContent = '記支出';

        const expCats = state.allCategories.filter(c => c.type === 'expense' && c.parentId === null && !c.isArchived);
        if (!state.selectedParentCategory || state.selectedParentCategory.type !== 'expense') {
          if (expCats.length > 0) setSelectedParentCategory(expCats[0]);
        } else {
          renderSubCategoryQuickPills();
        }
      } else if (type === 'income') {
        incBtn.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all bg-emerald-500 text-zinc-950 shadow-md';
        stdRow.classList.remove('hidden');
        quickSubCat?.classList.remove('hidden');
        traRow.classList.add('hidden');
        typeSymbol.className = 'text-emerald-400 font-bold text-xs';
        typeSymbol.textContent = 'NT$';
        amountDisp.className = 'text-xl sm:text-2xl font-black font-mono tracking-tight text-emerald-400 truncate';
        submitBtn.className = 'tap-scale px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-zinc-950 font-bold text-xs flex items-center gap-1 shadow-lg shadow-emerald-500/20';
        submitBtn.querySelector('span').textContent = '記收入';

        const incCats = state.allCategories.filter(c => c.type === 'income' && c.parentId === null && !c.isArchived);
        if (!state.selectedParentCategory || state.selectedParentCategory.type !== 'income') {
          if (incCats.length > 0) setSelectedParentCategory(incCats[0]);
        } else {
          renderSubCategoryQuickPills();
        }
      } else if (type === 'transfer') {
        traBtn.className = 'flex-1 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all bg-blue-500 text-zinc-950 shadow-md';
        stdRow.classList.add('hidden');
        quickSubCat?.classList.add('hidden');
        traRow.classList.remove('hidden');
        traRow.classList.add('grid');
        typeSymbol.className = 'text-blue-400 font-bold text-xs';
        typeSymbol.textContent = '轉帳';
        amountDisp.className = 'text-xl sm:text-2xl font-black font-mono tracking-tight text-blue-400 truncate';
        submitBtn.className = 'tap-scale px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-zinc-950 font-bold text-xs flex items-center gap-1 shadow-lg shadow-blue-500/20';
        submitBtn.querySelector('span').textContent = '轉帳';
      }
    }

    /**
     * Category & SubCategory Quick Selection Bar
     */
    function renderSubCategoryQuickPills() {
      const container = document.getElementById('quick-subcategory-container');
      if (!container) return;
      if (state.currentType === 'transfer' || !state.selectedParentCategory) {
        container.innerHTML = '';
        return;
      }

      const subCats = state.allCategories.filter(
        c => c.parentId === state.selectedParentCategory.id && !c.isArchived
      );

      if (subCats.length === 0) {
        container.innerHTML = '';
        return;
      }

      const isNoneSelected = !state.selectedSubCategory;
      let html = `
        <button onclick="pickSubCategory(null)" class="tap-scale flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${isNoneSelected ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'}">
          全部 / 無
        </button>
      `;

      for (const sub of subCats) {
        const isSelected = state.selectedSubCategory && state.selectedSubCategory.id === sub.id;
        html += `
          <button onclick="pickSubCategory(${sub.id})" class="tap-scale flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${isSelected ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'}">
            <img src="${sub.icon}" class="w-3.5 h-3.5 object-contain">
            <span>${sub.name}</span>
          </button>
        `;
      }

      container.innerHTML = html;
    }

    function setSelectedParentCategory(cat) {
      state.selectedParentCategory = cat;
      state.selectedSubCategory = null;
      document.getElementById('selected-category-name').textContent = cat.name;
      document.getElementById('selected-category-icon').src = cat.icon;
      
      document.getElementById('selected-subcategory-name').textContent = '無 (選填)';
      document.getElementById('selected-subcategory-icon').src = cat.icon;

      renderSubCategoryQuickPills();
    }

    function setSelectedSubCategory(subCat) {
      state.selectedSubCategory = subCat;
      if (subCat) {
        document.getElementById('selected-subcategory-name').textContent = subCat.name;
        document.getElementById('selected-subcategory-icon').src = subCat.icon;
      } else {
        document.getElementById('selected-subcategory-name').textContent = '無 (選填)';
        document.getElementById('selected-subcategory-icon').src = state.selectedParentCategory?.icon || 'asset/categories-food.svg';
      }
      renderSubCategoryQuickPills();
    }

    function openCategoryModal() {
      const grid = document.getElementById('modal-category-grid');
      const cats = state.allCategories.filter(
        c => c.type === state.currentType && c.parentId === null && !c.isArchived
      );

      grid.innerHTML = cats.map(cat => {
        const isSelected = state.selectedParentCategory && state.selectedParentCategory.id === cat.id;
        const activeClass = isSelected
          ? 'bg-amber-500/20 border-amber-500 text-amber-300 ring-2 ring-amber-500/40'
          : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800';

        return `
          <button onclick="pickParentCategory(${cat.id})" class="tap-scale flex flex-col items-center justify-center p-2 rounded-2xl border ${activeClass} transition-all">
            <div class="w-10 h-10 rounded-full flex items-center justify-center bg-zinc-800/90 p-2 mb-1 shadow">
              <img src="${cat.icon}" class="w-6 h-6 object-contain" alt="">
            </div>
            <span class="text-xs font-medium truncate w-full text-center">${cat.name}</span>
          </button>
        `;
      }).join('');

      document.getElementById('category-modal').classList.remove('hidden');
    }

    function pickParentCategory(catId) {
      const cat = state.allCategories.find(c => c.id === catId);
      if (cat) setSelectedParentCategory(cat);
      closeCategoryModal();
    }

    function closeCategoryModal() {
      document.getElementById('category-modal').classList.add('hidden');
    }

    function openSubCategoryModal() {
      if (!state.selectedParentCategory) {
        showToast('請先選取主分類', 'info');
        return;
      }

      const listEl = document.getElementById('modal-subcategory-list');
      document.getElementById('modal-subcat-parent-name').textContent = state.selectedParentCategory.name;

      const subCats = state.allCategories.filter(
        c => c.parentId === state.selectedParentCategory.id && !c.isArchived
      );

      let html = `
        <button onclick="pickSubCategory(null); closeSubCategoryModal();" class="tap-scale w-full flex items-center justify-between p-3 rounded-xl border ${!state.selectedSubCategory ? 'bg-amber-500/20 border-amber-500 text-amber-300' : 'bg-zinc-900 border-zinc-800 text-zinc-300'}">
          <span class="text-xs font-semibold">不指定子分類 (歸在主分類)</span>
          ${!state.selectedSubCategory ? '<i data-lucide="check" class="w-4 h-4 text-amber-400"></i>' : ''}
        </button>
      `;

      if (subCats.length > 0) {
        html += `<div class="grid grid-cols-2 gap-2 pt-2">`;
        html += subCats.map(sub => {
          const isSelected = state.selectedSubCategory && state.selectedSubCategory.id === sub.id;
          const activeClass = isSelected
            ? 'bg-amber-500/20 border-amber-500 text-amber-300'
            : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800';

          return `
            <button onclick="pickSubCategory(${sub.id}); closeSubCategoryModal();" class="tap-scale flex items-center gap-2 p-2.5 rounded-xl border ${activeClass}">
              <img src="${sub.icon}" class="w-4 h-4 object-contain">
              <span class="text-xs font-semibold truncate flex-1 text-left">${sub.name}</span>
              ${isSelected ? '<i data-lucide="check" class="w-3.5 h-3.5 text-amber-400"></i>' : ''}
            </button>
          `;
        }).join('');
        html += `</div>`;
      } else {
        html += `
          <div class="py-6 text-center text-zinc-500 text-xs">
            此主分類目前沒有子分類
          </div>
        `;
      }

      listEl.innerHTML = html;
      document.getElementById('subcategory-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function pickSubCategory(subId) {
      if (subId === null) {
        setSelectedSubCategory(null);
      } else {
        const sub = state.allCategories.find(c => c.id === subId);
        if (sub) setSelectedSubCategory(sub);
      }
    }

    function closeSubCategoryModal() {
      document.getElementById('subcategory-modal').classList.add('hidden');
    }

    /**
     * Account Modal & Selection
     */
    function setSelectedAccount(acc) {
      state.selectedAccount = acc;
      document.getElementById('selected-account-name').textContent = acc.name;
      document.getElementById('selected-account-icon').src = acc.icon;
      document.getElementById('transfer-source-name').textContent = acc.name;
      document.getElementById('transfer-source-icon').src = acc.icon;
    }

    function setTransferTargetAccount(acc) {
      state.transferTargetAccount = acc;
      document.getElementById('transfer-target-name').textContent = acc.name;
      document.getElementById('transfer-target-icon').src = acc.icon;
    }

    function openAccountModal(target = 'source') {
      state.accountModalTarget = target;
      const listEl = document.getElementById('modal-account-list');
      const titleEl = document.getElementById('modal-account-title');
      
      titleEl.innerHTML = `<i data-lucide="wallet" class="w-4 h-4 text-amber-400"></i> 選擇${target === 'target' ? '轉入' : (state.currentType === 'transfer' ? '轉出' : '付款')}帳戶`;

      const groups = ['現金', '銀行', '信用卡'];
      let html = '';

      for (const grp of groups) {
        const accs = state.allAccounts.filter(a => a.groupName === grp && !a.isArchived);
        if (accs.length === 0) continue;

        html += `
          <div>
            <div class="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 px-1">${grp}</div>
            <div class="grid grid-cols-2 gap-2">
              ${accs.map(acc => {
                const currentAcc = target === 'target' ? state.transferTargetAccount : state.selectedAccount;
                const isSelected = currentAcc && currentAcc.id === acc.id;
                const activeStyle = isSelected
                  ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800';

                return `
                  <button onclick="pickAccount(${acc.id})" class="tap-scale flex items-center gap-2 p-2.5 rounded-xl border ${activeStyle} text-left">
                    <img src="${acc.icon}" class="w-4 h-4 object-contain">
                    <span class="text-xs font-semibold truncate flex-1">${acc.name}</span>
                    ${isSelected ? '<i data-lucide="check" class="w-4 h-4 text-amber-400"></i>' : ''}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      listEl.innerHTML = html;
      document.getElementById('account-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function pickAccount(accId) {
      const acc = state.allAccounts.find(a => a.id === accId);
      if (!acc) return;

      if (state.accountModalTarget === 'target') {
        setTransferTargetAccount(acc);
      } else {
        setSelectedAccount(acc);
      }
      closeAccountModal();
    }

    function closeAccountModal() {
      document.getElementById('account-modal').classList.add('hidden');
    }

    /**
     * Calculator Sheet Logic
     */
    function openCalculatorSheet() {
      updateCalculatorSheetDisplay();
      document.getElementById('calc-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeCalculatorSheet() {
      document.getElementById('calc-modal').classList.add('hidden');
    }

    function keypadInput(val) {
      const current = state.calcExpression;
      const ops = ['+', '-', '*', '/'];

      if (current === '0' && !ops.includes(val) && val !== '.') {
        state.calcExpression = val;
      } else {
        const lastChar = current.slice(-1);
        if (ops.includes(lastChar) && ops.includes(val)) {
          state.calcExpression = current.slice(0, -1) + val;
        } else if (val === '.') {
          const segments = current.split(/[\+\-\*\/]/);
          const lastSeg = segments[segments.length - 1];
          if (!lastSeg.includes('.')) {
            state.calcExpression += val;
          }
        } else {
          if (state.calcExpression.length < 24) {
            state.calcExpression += val;
          }
        }
      }
      updateCalculatorSheetDisplay();
    }

    function keypadClear() {
      state.calcExpression = '0';
      updateCalculatorSheetDisplay();
    }

    function keypadBackspace() {
      if (state.calcExpression.length > 1) {
        state.calcExpression = state.calcExpression.slice(0, -1);
      } else {
        state.calcExpression = '0';
      }
      updateCalculatorSheetDisplay();
    }

    function evaluateExpression(expr) {
      try {
        let sanitized = String(expr).replace(/[^0-9\+\-\*\/\.]/g, '');
        while (['+', '-', '*', '/'].includes(sanitized.slice(-1))) {
          sanitized = sanitized.slice(0, -1);
        }
        if (!sanitized) return 0;
        const result = Function(`'use strict'; return (${sanitized})`)();
        if (isNaN(result) || !isFinite(result)) return 0;
        return Math.round(result * 100) / 100;
      } catch (e) {
        return 0;
      }
    }

    function updateCalculatorSheetDisplay() {
      const expr = state.calcExpression;
      const formulaEl = document.getElementById('calc-modal-formula');
      const amountEl = document.getElementById('calc-modal-amount');
      const ops = ['+', '-', '*', '/'];

      const hasOp = ops.some(op => expr.includes(op));
      const evalVal = evaluateExpression(expr);

      if (hasOp) {
        formulaEl.textContent = expr.replace(/\*/g, '×').replace(/\//g, '÷');
        amountEl.textContent = evalVal.toLocaleString();
      } else {
        formulaEl.textContent = '';
        amountEl.textContent = parseFloat(expr || 0).toLocaleString();
      }

      document.getElementById('card-display-amount').textContent = evalVal.toLocaleString();
    }

    function confirmCalculatorAmount() {
      updateCalculatorSheetDisplay();
      closeCalculatorSheet();
    }

    /**
     * Submit Transaction (Expense / Income / Transfer)
     */
    async function submitTransaction() {
      const finalAmount = evaluateExpression(state.calcExpression);

      if (finalAmount <= 0) {
        showToast('金額必須大於 0', 'error');
        openCalculatorSheet();
        return;
      }

      const noteText = document.getElementById('input-note').value.trim();

      if (state.currentType === 'transfer') {
        if (!state.selectedAccount || !state.transferTargetAccount) {
          showToast('請選取轉出與轉入帳戶', 'error');
          return;
        }
        if (state.selectedAccount.id === state.transferTargetAccount.id) {
          showToast('轉出與轉入帳戶不可相同', 'error');
          return;
        }

        const newTransferRecord = {
          type: 'transfer',
          amount: finalAmount,
          parentCategoryId: null,
          subCategoryId: null,
          accountId: state.selectedAccount.id,
          targetAccountId: state.transferTargetAccount.id,
          date: state.selectedDate,
          note: noteText,
          recurringId: null,
          createdAt: Date.now()
        };

        try {
          await db.records.add(newTransferRecord);
          showToast(`已成功轉帳 NT$ ${finalAmount.toLocaleString()}`, 'success');
          resetTransactionForm();
          await renderWeekStripCalendar();
          await renderTodayRecords();
        } catch (err) {
          console.error(err);
          showToast('轉帳失敗，請重試', 'error');
        }

      } else {
        if (!state.selectedParentCategory) {
          showToast('請選取主分類', 'error');
          return;
        }
        if (!state.selectedAccount) {
          showToast('請選取帳戶', 'error');
          return;
        }

        const newRecord = {
          type: state.currentType,
          amount: finalAmount,
          parentCategoryId: state.selectedParentCategory.id,
          subCategoryId: state.selectedSubCategory ? state.selectedSubCategory.id : null,
          accountId: state.selectedAccount.id,
          targetAccountId: null,
          date: state.selectedDate,
          note: noteText,
          recurringId: null,
          createdAt: Date.now()
        };

        try {
          await db.records.add(newRecord);
          showToast(`已記錄 NT$ ${finalAmount.toLocaleString()}`, 'success');
          resetTransactionForm();
          await renderWeekStripCalendar();
          await renderTodayRecords();
        } catch (err) {
          console.error(err);
          showToast('儲存失敗，請重試', 'error');
        }
      }
    }

    function resetTransactionForm() {
      state.calcExpression = '0';
      document.getElementById('input-note').value = '';
      updateCalculatorSheetDisplay();
    }

    /**
     * Render Records for Selected Date
     */
    async function renderTodayRecords() {
      const records = await db.records
        .where('date')
        .equals(state.selectedDate)
        .reverse()
        .sortBy('createdAt');

      state.todayRecords = records;
      const listEl = document.getElementById('today-records-list');
      const totalSummaryEl = document.getElementById('today-total-summary');

      let totalExpense = 0;
      let totalIncome = 0;

      for (const rec of records) {
        if (rec.type === 'expense') totalExpense += rec.amount;
        if (rec.type === 'income') totalIncome += rec.amount;
      }

      totalSummaryEl.textContent = `支出: NT$ ${totalExpense.toLocaleString()} | 收入: NT$ ${totalIncome.toLocaleString()}`;

      if (records.length === 0) {
        listEl.innerHTML = `
          <div class="py-12 flex flex-col items-center justify-center text-zinc-500 border border-dashed border-zinc-800/80 rounded-2xl bg-zinc-900/30">
            <i data-lucide="inbox" class="w-10 h-10 mb-2 opacity-40"></i>
            <span class="text-xs">本日尚無記帳明細</span>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      listEl.innerHTML = records.map(rec => {
        if (rec.type === 'transfer') {
          const fromAcc = state.allAccounts.find(a => a.id === rec.accountId);
          const toAcc = state.allAccounts.find(a => a.id === rec.targetAccountId);

          return `
            <div class="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition-all shadow-sm">
              <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                <div class="w-9 h-9 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center p-2 flex-shrink-0">
                  <i data-lucide="arrow-right-left" class="w-5 h-5"></i>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-1.5 text-base font-bold text-zinc-200">
                    <span>${fromAcc?.name || '未知'}</span>
                    <i data-lucide="arrow-right" class="w-3.5 h-3.5 text-zinc-500"></i>
                    <span>${toAcc?.name || '未知'}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 font-normal">轉帳</span>
                  </div>
                  ${rec.note ? `<div class="text-xs text-zinc-400 truncate mt-0.5">${rec.note}</div>` : ''}
                </div>
              </div>

              <div class="flex items-center gap-1 flex-shrink-0">
                <div class="text-right mr-1">
                  <div class="text-xs font-mono font-bold text-blue-400">
                    ${rec.amount.toLocaleString()}
                  </div>
                </div>
                <button onclick="openEditRecordModal(${rec.id})" title="修改" class="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="confirmDeleteRecord(${rec.id})" title="刪除" class="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>
          `;
        }

        const parentCat = state.allCategories.find(c => c.id === rec.parentCategoryId);
        const subCat = rec.subCategoryId ? state.allCategories.find(c => c.id === rec.subCategoryId) : null;
        const acc = state.allAccounts.find(a => a.id === rec.accountId);

        const isExp = rec.type === 'expense';
        const sign = isExp ? '-' : '+';
        const amountColor = isExp ? 'text-zinc-100' : 'text-emerald-400';
        const iconSrc = subCat?.icon || parentCat?.icon || 'asset/categories-money.svg';
        const catTitle = subCat ? `${parentCat?.name || ''} · ${subCat.name}` : (parentCat?.name || '未分類');

        return `
          <div class="flex items-center justify-between p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700 transition-all shadow-sm">
            <div class="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
              <div class="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center p-2 flex-shrink-0 shadow-inner">
                <img src="${iconSrc}" class="w-5 h-5 object-contain" alt="">
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <span class="text-base font-bold text-zinc-200 truncate">${catTitle}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 flex-shrink-0">${acc?.name || '未知'}</span>
                </div>
                ${rec.note ? `<div class="text-xs text-zinc-400 truncate mt-0.5">${rec.note}</div>` : ''}
              </div>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              <div class="text-right mr-1">
                <div class="text-xs font-mono font-bold ${amountColor}">
                  ${sign}${rec.amount.toLocaleString()}
                </div>
              </div>
              <button onclick="openEditRecordModal(${rec.id})" title="修改" class="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors">
                <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
              </button>
              <button onclick="confirmDeleteRecord(${rec.id})" title="刪除" class="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    /**
     * Edit Record Logic (流水帳修改)
     */
    async function openEditRecordModal(recordId) {
      const rec = await db.records.get(recordId);
      if (!rec) return;

      document.getElementById('edit-record-id').value = rec.id;
      document.getElementById('edit-record-amount').value = rec.amount;
      document.getElementById('edit-record-date').value = rec.date;
      document.getElementById('edit-record-note').value = rec.note || '';

      switchEditRecordType(rec.type, false);

      // Populate Account options
      const accSelect = document.getElementById('edit-record-account');
      const fromAccSelect = document.getElementById('edit-record-from-account');
      const toAccSelect = document.getElementById('edit-record-to-account');

      const accOptions = state.allAccounts.map(a => `<option value="${a.id}">${a.name} (${a.groupName})</option>`).join('');
      accSelect.innerHTML = accOptions;
      fromAccSelect.innerHTML = accOptions;
      toAccSelect.innerHTML = accOptions;

      if (rec.type === 'transfer') {
        fromAccSelect.value = rec.accountId;
        toAccSelect.value = rec.targetAccountId;
      } else {
        accSelect.value = rec.accountId;

        // Populate Category Options
        const parentSelect = document.getElementById('edit-record-parent-cat');
        const validCats = state.allCategories.filter(c => c.type === rec.type && c.parentId === null);
        parentSelect.innerHTML = validCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        parentSelect.value = rec.parentCategoryId;

        onEditParentCatChanged(rec.parentCategoryId, rec.subCategoryId);
      }

      document.getElementById('edit-record-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function switchEditRecordType(type, resetCats = true) {
      state.editRecordType = type;
      const expTab = document.getElementById('edit-tab-expense');
      const incTab = document.getElementById('edit-tab-income');
      const traTab = document.getElementById('edit-tab-transfer');
      const stdFields = document.getElementById('edit-fields-standard');
      const traFields = document.getElementById('edit-fields-transfer');

      expTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
      incTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
      traTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';

      if (type === 'expense') {
        expTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-amber-500 text-zinc-950';
        stdFields.classList.remove('hidden');
        traFields.classList.add('hidden');
      } else if (type === 'income') {
        incTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-zinc-950';
        stdFields.classList.remove('hidden');
        traFields.classList.add('hidden');
      } else if (type === 'transfer') {
        traTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-blue-500 text-zinc-950';
        stdFields.classList.add('hidden');
        traFields.classList.remove('hidden');
      }

      if (resetCats && (type === 'expense' || type === 'income')) {
        const parentSelect = document.getElementById('edit-record-parent-cat');
        const validCats = state.allCategories.filter(c => c.type === type && c.parentId === null);
        parentSelect.innerHTML = validCats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        if (validCats.length > 0) {
          parentSelect.value = validCats[0].id;
          onEditParentCatChanged(validCats[0].id);
        }
      }
    }

    function onEditParentCatChanged(parentId, targetSubCatId = null) {
      const subSelect = document.getElementById('edit-record-sub-cat');
      const pId = parseInt(parentId, 10);
      const subCats = state.allCategories.filter(c => c.parentId === pId);

      let opts = '<option value="">無子分類</option>';
      for (const sub of subCats) {
        opts += `<option value="${sub.id}">${sub.name}</option>`;
      }
      subSelect.innerHTML = opts;
      if (targetSubCatId) {
        subSelect.value = targetSubCatId;
      }
    }

    function closeEditRecordModal() {
      document.getElementById('edit-record-modal').classList.add('hidden');
    }

    async function saveEditRecord() {
      const recIdStr = document.getElementById('edit-record-id').value;
      const recId = parseInt(recIdStr, 10);
      const amount = parseFloat(document.getElementById('edit-record-amount').value);
      const date = document.getElementById('edit-record-date').value;
      const note = document.getElementById('edit-record-note').value.trim();

      if (isNaN(amount) || amount <= 0) {
        showToast('金額必須大於 0', 'error');
        return;
      }
      if (!date) {
        showToast('請選取日期', 'error');
        return;
      }

      if (state.editRecordType === 'transfer') {
        const fromAccId = parseInt(document.getElementById('edit-record-from-account').value, 10);
        const toAccId = parseInt(document.getElementById('edit-record-to-account').value, 10);

        if (fromAccId === toAccId) {
          showToast('轉出與轉入帳戶不可相同', 'error');
          return;
        }

        await db.records.update(recId, {
          type: 'transfer',
          amount: amount,
          date: date,
          accountId: fromAccId,
          targetAccountId: toAccId,
          parentCategoryId: null,
          subCategoryId: null,
          note: note
        });
      } else {
        const accId = parseInt(document.getElementById('edit-record-account').value, 10);
        const parentCatId = parseInt(document.getElementById('edit-record-parent-cat').value, 10);
        const subCatVal = document.getElementById('edit-record-sub-cat').value;
        const subCatId = subCatVal ? parseInt(subCatVal, 10) : null;

        if (!parentCatId) {
          showToast('請選取主分類', 'error');
          return;
        }

        await db.records.update(recId, {
          type: state.editRecordType,
          amount: amount,
          date: date,
          accountId: accId,
          targetAccountId: null,
          parentCategoryId: parentCatId,
          subCategoryId: subCatId,
          note: note
        });
      }

      showToast('流水帳已成功更新', 'success');
      closeEditRecordModal();
      await renderWeekStripCalendar();
      await renderTodayRecords();
    }

    /**
     * Duplicate Record
     */
    async function duplicateRecord(recordId) {
      const rec = await db.records.get(recordId);
      if (!rec) return;

      const newRec = {
        type: rec.type,
        amount: rec.amount,
        parentCategoryId: rec.parentCategoryId,
        subCategoryId: rec.subCategoryId,
        accountId: rec.accountId,
        targetAccountId: rec.targetAccountId,
        date: state.selectedDate,
        note: rec.note ? `${rec.note} (複製)` : '複製項目',
        recurringId: null,
        createdAt: Date.now()
      };

      await db.records.add(newRec);
      showToast('已複製紀錄至本日', 'success');
      await renderWeekStripCalendar();
      await renderTodayRecords();
    }

    /**
     * Account Balances Calculation & Management Modal
     */
    async function openAccountManageModal() {
      const container = document.getElementById('manage-account-list');
      const allRecords = await db.records.toArray();
      const groups = ['現金', '銀行', '信用卡'];
      
      let html = '';
      for (const grp of groups) {
        const accs = state.allAccounts.filter(a => a.groupName === grp);
        if (accs.length === 0) continue;

        html += `
          <div class="bg-zinc-900/90 rounded-2xl p-3 border border-zinc-800">
            <div class="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-2.5">${grp}</div>
            <div class="space-y-2.5">
              ${accs.map(acc => {
                let bal = acc.initialBalance || 0;
                for (const r of allRecords) {
                  if (r.type === 'income' && r.accountId === acc.id) bal += r.amount;
                  if (r.type === 'expense' && r.accountId === acc.id) bal -= r.amount;
                  if (r.type === 'transfer') {
                    if (r.accountId === acc.id) bal -= r.amount;
                    if (r.targetAccountId === acc.id) bal += r.amount;
                  }
                }

                return `
                  <div class="p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 space-y-2 ${acc.isArchived ? 'opacity-50' : ''}">
                    <!-- 第一行：icon、帳戶名稱、編輯、封存 -->
                    <div class="flex items-center justify-between gap-2 flex-wrap">
                      <div class="flex items-center gap-2.5 min-w-0">
                        <img src="${acc.icon}" class="w-6 h-6 object-contain shrink-0">
                        <span class="text-sm font-bold text-zinc-100 truncate">${acc.name}</span>
                        ${acc.isDefault ? '<span class="text-sm px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded shrink-0">預設</span>' : ''}
                        ${acc.isArchived ? '<span class="text-sm px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded shrink-0">已封存</span>' : ''}
                      </div>
                      <div class="flex items-center gap-1.5 shrink-0 ml-auto">
                        <button onclick="openEditAccountForm(${acc.id})" class="text-sm px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1 font-semibold">
                          <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                          <span>編輯</span>
                        </button>
                        <button onclick="toggleArchiveAccount(${acc.id})" class="text-sm px-2.5 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
                          ${acc.isArchived ? '解封' : '封存'}
                        </button>
                      </div>
                    </div>

                    <!-- 第二行：初始金額、當前餘額金額 -->
                    <div class="text-sm text-zinc-400 font-mono pl-[34px] flex items-center gap-2 flex-wrap">
                      <span>初始: NT$ ${(acc.initialBalance || 0).toLocaleString()}</span>
                      <span class="text-zinc-600">｜</span>
                      <span>當前餘額: <span class="font-bold text-zinc-100">NT$ ${bal.toLocaleString()}</span></span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      container.innerHTML = html;
      document.getElementById('account-manage-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeAccountManageModal() {
      document.getElementById('account-manage-modal').classList.add('hidden');
    }

    async function toggleArchiveAccount(accId) {
      const acc = state.allAccounts.find(a => a.id === accId);
      if (!acc) return;
      
      const willArchive = !acc.isArchived;
      if (willArchive && acc.isDefault) {
        showToast('預設帳戶不可直接封存', 'error');
        return;
      }

      await db.accounts.update(accId, { isArchived: willArchive });
      await loadAllData();
      showToast(willArchive ? '已封存該帳戶' : '已解封該帳戶', 'success');
      await openAccountManageModal();
    }

    function openNewAccountForm() {
      document.getElementById('form-account-id').value = '';
      document.getElementById('form-account-title').textContent = '新增帳戶';
      document.getElementById('form-account-group').value = '現金';
      document.getElementById('form-account-name').value = '';
      document.getElementById('form-account-balance').value = '0';
      
      const radios = document.querySelectorAll('input[name="acc-icon"]');
      radios.forEach((r, idx) => {
        r.checked = (idx === 0);
      });

      document.getElementById('account-form-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function openEditAccountForm(accId) {
      const acc = state.allAccounts.find(a => a.id == accId);
      if (!acc) return;

      document.getElementById('form-account-id').value = acc.id;
      document.getElementById('form-account-title').textContent = `編輯帳戶 - ${acc.name}`;
      document.getElementById('form-account-group').value = acc.groupName;
      document.getElementById('form-account-name').value = acc.name;
      document.getElementById('form-account-balance').value = acc.initialBalance !== undefined ? acc.initialBalance : 0;

      const radios = document.querySelectorAll('input[name="acc-icon"]');
      radios.forEach(r => {
        r.checked = (r.value === acc.icon);
      });

      document.getElementById('account-form-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeAccountFormModal() {
      document.getElementById('account-form-modal').classList.add('hidden');
    }

    async function saveAccountForm() {
      const accIdStr = document.getElementById('form-account-id').value;
      const name = document.getElementById('form-account-name').value.trim();
      const groupName = document.getElementById('form-account-group').value;
      const bal = parseFloat(document.getElementById('form-account-balance').value) || 0;
      const icon = document.querySelector('input[name="acc-icon"]:checked')?.value || 'asset/account-dollar.svg';

      if (!name) {
        showToast('請輸入帳戶名稱', 'error');
        return;
      }

      if (accIdStr) {
        const accId = parseInt(accIdStr, 10);
        await db.accounts.update(accId, {
          name,
          groupName,
          icon,
          initialBalance: bal
        });
        showToast(`已成功修改帳戶「${name}」與初始值`, 'success');
      } else {
        await db.accounts.add({
          name,
          groupName,
          icon,
          initialBalance: bal,
          isDefault: false,
          isArchived: false
        });
        showToast(`已成功新增帳戶「${name}」`, 'success');
      }

      await loadAllData();
      if (state.selectedAccount && state.selectedAccount.id == accIdStr) {
        const updated = state.allAccounts.find(a => a.id == accIdStr);
        if (updated) setSelectedAccount(updated);
      }
      closeAccountFormModal();
      await openAccountManageModal();
    }

    /**
     * Category Management Modal
     */
    function openCategoryManageModal() {
      renderCategoryManageList();
      document.getElementById('category-manage-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeCategoryManageModal() {
      document.getElementById('category-manage-modal').classList.add('hidden');
    }

    function switchCategoryManageType(type) {
      state.categoryManageType = type;
      const expTab = document.getElementById('cat-manage-tab-exp');
      const incTab = document.getElementById('cat-manage-tab-inc');

      if (type === 'expense') {
        expTab.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold bg-amber-500 text-zinc-950';
        incTab.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold text-zinc-400';
      } else {
        incTab.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold bg-emerald-500 text-zinc-950';
        expTab.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold text-zinc-400';
      }
      renderCategoryManageList();
    }

    function renderCategoryManageList() {
      const listEl = document.getElementById('manage-category-list');
      const parents = state.allCategories.filter(
        c => c.type === state.categoryManageType && c.parentId === null
      );

      listEl.innerHTML = parents.map(p => {
        const subs = state.allCategories.filter(c => c.parentId === p.id);

        return `
          <div class="bg-zinc-900 rounded-2xl p-3 border border-zinc-800 ${p.isArchived ? 'opacity-50' : ''}">
            <div class="pb-2.5 border-b border-zinc-800 space-y-2">
              <div class="flex items-center gap-2 flex-wrap">
                <img src="${p.icon}" class="w-5 h-5 object-contain shrink-0">
                <span class="text-sm font-bold text-zinc-200">${p.name}</span>
                ${p.type === 'expense' ? `
                  <span class="text-sm px-2 py-0.5 rounded-full ${p.budgetMonthly > 0 ? 'bg-amber-950/60 text-amber-400 border border-amber-800/60' : 'bg-zinc-800 text-zinc-500'} font-mono">
                    ${p.budgetMonthly > 0 ? `預算 ${p.budgetMonthly.toLocaleString()}` : '未設預算'}
                  </span>
                ` : ''}
                ${p.isArchived ? '<span class="text-sm px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">已封存</span>' : ''}
              </div>
              <div class="flex items-center gap-2">
                <button onclick="openEditCategoryForm(${p.id})" class="text-sm px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-semibold">
                  編輯
                </button>
                <button onclick="openNewCategoryForm(${p.id})" class="text-sm px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-bold hover:bg-amber-500/30">
                  + 子分類
                </button>
                <button onclick="toggleArchiveCategory(${p.id})" class="text-sm px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                  ${p.isArchived ? '解封' : '封存'}
                </button>
              </div>
            </div>

            <div class="pt-2 flex flex-wrap gap-1.5">
              ${subs.length > 0 ? subs.map(s => `
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700/60 text-sm text-zinc-300 ${s.isArchived ? 'opacity-50' : ''}">
                  <img src="${s.icon}" class="w-4 h-4 object-contain shrink-0">
                  <span class="break-words">${s.name}</span>
                  <button onclick="openEditCategoryForm(${s.id})" title="編輯" class="text-zinc-400 hover:text-amber-300 ml-0.5 shrink-0">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                  </button>
                  <button onclick="toggleArchiveCategory(${s.id})" title="${s.isArchived ? '解封' : '封存'}" class="text-zinc-500 hover:text-red-400 ml-0.5 shrink-0">
                    <i data-lucide="${s.isArchived ? 'rotate-ccw' : 'x'}" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              `).join('') : '<span class="text-sm text-zinc-500">尚無子分類</span>'}
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    async function toggleArchiveCategory(catId) {
      const cat = state.allCategories.find(c => c.id === catId);
      if (!cat) return;

      const willArchive = !cat.isArchived;
      await db.categories.update(catId, { isArchived: willArchive });
      await loadAllData();
      showToast(willArchive ? '已封存分類' : '已解封分類', 'success');
      renderCategoryManageList();
      renderSubCategoryQuickPills();
    }

    function switchCategoryFormLevel(level) {
      state.categoryFormLevel = level;
      const pBtn = document.getElementById('form-level-parent');
      const sBtn = document.getElementById('form-level-sub');
      const parentSelectWrap = document.getElementById('form-cat-parent-select-wrap');
      const budgetWrap = document.getElementById('form-cat-budget-wrap');

      if (level === 'parent') {
        pBtn.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold bg-amber-500 text-zinc-950';
        sBtn.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold text-zinc-400';
        parentSelectWrap.classList.add('hidden');
        if (state.categoryManageType === 'expense') {
          budgetWrap?.classList.remove('hidden');
        } else {
          budgetWrap?.classList.add('hidden');
        }
      } else {
        sBtn.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold bg-amber-500 text-zinc-950';
        pBtn.className = 'flex-1 py-1.5 rounded-lg text-sm font-bold text-zinc-400';
        parentSelectWrap.classList.remove('hidden');
        budgetWrap?.classList.add('hidden');
      }
    }

    function populateParentCategorySelect(selectedParentId = null) {
      const selectEl = document.getElementById('form-cat-parent-id');
      const parents = state.allCategories.filter(
        c => c.type === state.categoryManageType && c.parentId === null && !c.isArchived
      );

      selectEl.innerHTML = parents.map(p => `
        <option value="${p.id}">${p.name}</option>
      `).join('');

      if (selectedParentId) {
        selectEl.value = selectedParentId;
      } else if (parents.length > 0) {
        selectEl.value = parents[0].id;
      }
    }

    function openNewCategoryForm(parentId = null) {
      document.getElementById('form-cat-id').value = '';
      document.getElementById('form-cat-name').value = '';
      const budgetInput = document.getElementById('form-cat-budget');
      if (budgetInput) budgetInput.value = '0';
      populateParentCategorySelect(parentId);

      if (parentId) {
        document.getElementById('category-form-title').textContent = '新增子分類';
        switchCategoryFormLevel('sub');
      } else {
        document.getElementById('category-form-title').textContent = '新增分類';
        switchCategoryFormLevel('parent');
      }

      const iconGrid = document.getElementById('form-cat-icon-grid');
      iconGrid.innerHTML = AVAILABLE_ICONS.map((icon, idx) => `
        <label class="flex items-center justify-center p-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-amber-400 cursor-pointer">
          <input type="radio" name="cat-icon-choice" value="${icon}" class="hidden" ${idx === 0 ? 'checked' : ''}>
          <img src="${icon}" class="w-5 h-5 object-contain">
        </label>
      `).join('');

      document.getElementById('category-form-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function openEditCategoryForm(catId) {
      const cat = state.allCategories.find(c => c.id == catId);
      if (!cat) return;

      document.getElementById('form-cat-id').value = cat.id;
      document.getElementById('form-cat-name').value = cat.name;
      const budgetInput = document.getElementById('form-cat-budget');
      if (budgetInput) budgetInput.value = cat.budgetMonthly || 0;
      populateParentCategorySelect(cat.parentId);

      if (cat.parentId !== null) {
        document.getElementById('category-form-title').textContent = `編輯子分類 - ${cat.name}`;
        switchCategoryFormLevel('sub');
      } else {
        document.getElementById('category-form-title').textContent = `編輯主分類 - ${cat.name}`;
        switchCategoryFormLevel('parent');
      }

      const iconGrid = document.getElementById('form-cat-icon-grid');
      iconGrid.innerHTML = AVAILABLE_ICONS.map((icon) => `
        <label class="flex items-center justify-center p-2 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-amber-400 cursor-pointer">
          <input type="radio" name="cat-icon-choice" value="${icon}" class="hidden" ${icon === cat.icon ? 'checked' : ''}>
          <img src="${icon}" class="w-5 h-5 object-contain">
        </label>
      `).join('');

      document.getElementById('category-form-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeCategoryFormModal() {
      document.getElementById('category-form-modal').classList.add('hidden');
    }

    async function saveCategoryForm() {
      const catIdStr = document.getElementById('form-cat-id').value;
      const name = document.getElementById('form-cat-name').value.trim();
      const isSub = (state.categoryFormLevel === 'sub');
      const parentSelectVal = document.getElementById('form-cat-parent-id').value;
      const parentId = isSub && parentSelectVal ? parseInt(parentSelectVal, 10) : null;
      const icon = document.querySelector('input[name="cat-icon-choice"]:checked')?.value || 'asset/categories-money.svg';
      const budgetVal = (!isSub && state.categoryManageType === 'expense')
        ? Math.max(0, parseFloat(document.getElementById('form-cat-budget')?.value) || 0)
        : 0;

      if (!name) {
        showToast('請輸入分類名稱', 'error');
        return;
      }

      if (isSub && !parentId) {
        showToast('請先建立主分類才能新增子分類', 'error');
        return;
      }

      if (catIdStr) {
        const catId = parseInt(catIdStr, 10);
        const updatePayload = {
          name,
          parentId,
          icon
        };
        if (!isSub) {
          updatePayload.budgetMonthly = budgetVal;
        }
        await db.categories.update(catId, updatePayload);
        showToast(`已成功修改分類「${name}」`, 'success');
      } else {
        await db.categories.add({
          name,
          type: state.categoryManageType,
          parentId: parentId,
          icon: icon,
          color: '#f59e0b',
          budgetMonthly: budgetVal,
          isArchived: false
        });
        showToast(`已成功新增「${name}」`, 'success');
      }

      await loadAllData();
      closeCategoryFormModal();
      renderCategoryManageList();
      renderSubCategoryQuickPills();
    }

    /**
     * Delete Confirmation Modal
     */
    let pendingDeleteId = null;
    function confirmDeleteRecord(id) {
      pendingDeleteId = id;
      document.getElementById('confirm-modal-msg').textContent = '確定要刪除這筆資料嗎？此動作無法復原。';
      document.getElementById('confirm-modal').classList.remove('hidden');
      document.getElementById('btn-confirm-delete').onclick = async () => {
        if (pendingDeleteId) {
          await db.records.delete(pendingDeleteId);
          showToast('已刪除紀錄', 'success');
          closeConfirmModal();
          await renderWeekStripCalendar();
          await renderTodayRecords();
        }
      };
      lucide.createIcons();
    }

    function confirmDeleteRecurring(id) {
      document.getElementById('confirm-modal-msg').textContent = '確定要刪除這筆固定收支排程嗎？';
      document.getElementById('confirm-modal').classList.remove('hidden');
      document.getElementById('btn-confirm-delete').onclick = async () => {
        await db.recurring.delete(id);
        showToast('已刪除固定收支排程', 'success');
        closeConfirmModal();
        await renderRecurringList();
      };
      lucide.createIcons();
    }

    function confirmDeleteTemplate(id) {
      document.getElementById('confirm-modal-msg').textContent = '確定要刪除這個常用支出模板嗎？';
      document.getElementById('confirm-modal').classList.remove('hidden');
      document.getElementById('btn-confirm-delete').onclick = async () => {
        await db.templates.delete(id);
        showToast('已刪除模板', 'success');
        closeConfirmModal();
        await renderTemplateList();
      };
      lucide.createIcons();
    }

    function closeConfirmModal() {
      pendingDeleteId = null;
      document.getElementById('confirm-modal').classList.add('hidden');
    }

    /**
     * =========================================================================
     * Phase 4: Reports Modal & Chart.js Integration (月報表 / 年度報表)
     * =========================================================================
     */
    async function openReportsModal() {
      if (state.selectedDate) {
        const parts = state.selectedDate.split('-');
        state.reportYear = parseInt(parts[0], 10) || new Date().getFullYear();
        state.reportMonth = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
      } else {
        const now = new Date();
        state.reportYear = now.getFullYear();
        state.reportMonth = now.getMonth() + 1;
      }

      state.reportTab = 'month';
      state.reportExpandedCatId = null;
      state.reportBudgetExpanded = false;
      state.annualBarMetric = 'expense';

      // 更新 Tab 樣式與視圖容器
      updateReportTabUI();
      await renderReportView();

      document.getElementById('reports-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeReportsModal() {
      document.getElementById('reports-modal').classList.add('hidden');
      // 清除圖表實例釋放記憶體
      if (state.chartInstance) {
        state.chartInstance.destroy();
        state.chartInstance = null;
      }
      if (state.annualBarChartInstance) {
        state.annualBarChartInstance.destroy();
        state.annualBarChartInstance = null;
      }
      if (state.annualPieChartInstance) {
        state.annualPieChartInstance.destroy();
        state.annualPieChartInstance = null;
      }
    }

    function updateReportTabUI() {
      const btnMonth = document.getElementById('report-tab-btn-month');
      const btnYear = document.getElementById('report-tab-btn-year');
      const monthContainer = document.getElementById('report-month-container');
      const yearContainer = document.getElementById('report-year-container');

      if (state.reportTab === 'month') {
        if (btnMonth) {
          btnMonth.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-zinc-950 shadow';
        }
        if (btnYear) {
          btnYear.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-zinc-400 hover:text-zinc-200';
        }
        if (monthContainer) monthContainer.classList.remove('hidden');
        if (yearContainer) yearContainer.classList.add('hidden');
      } else {
        if (btnMonth) {
          btnMonth.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all text-zinc-400 hover:text-zinc-200';
        }
        if (btnYear) {
          btnYear.className = 'flex-1 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-zinc-950 shadow';
        }
        if (monthContainer) monthContainer.classList.add('hidden');
        if (yearContainer) yearContainer.classList.remove('hidden');
      }
    }

    async function switchReportTab(tab) {
      if (state.reportTab === tab) return;
      state.reportTab = tab;
      state.reportExpandedCatId = null;
      updateReportTabUI();
      await renderReportView();
      lucide.createIcons();
    }

    async function changeReportPeriod(delta) {
      if (state.reportTab === 'month') {
        state.reportMonth += delta;
        if (state.reportMonth > 12) {
          state.reportMonth = 1;
          state.reportYear += 1;
        } else if (state.reportMonth < 1) {
          state.reportMonth = 12;
          state.reportYear -= 1;
        }
      } else {
        state.reportYear += delta;
      }
      await renderReportView();
      lucide.createIcons();
    }

    function openReportPeriodPicker() {
      if (state.reportTab === 'month') {
        const picker = document.getElementById('report-month-input');
        if (picker) {
          picker.value = `${state.reportYear}-${String(state.reportMonth).padStart(2, '0')}`;
          picker.showPicker?.() || picker.click();
        }
      }
    }

    async function onReportMonthPickerChanged(val) {
      if (!val) return;
      const parts = val.split('-');
      if (parts.length === 2) {
        state.reportYear = parseInt(parts[0], 10);
        state.reportMonth = parseInt(parts[1], 10);
        await renderReportView();
        lucide.createIcons();
      }
    }

    async function renderReportView() {
      const periodLabel = document.getElementById('report-period-label');
      if (periodLabel) {
        if (state.reportTab === 'month') {
          periodLabel.textContent = `${state.reportYear}年 ${state.reportMonth}月`;
        } else {
          periodLabel.textContent = `${state.reportYear}年度`;
        }
      }

      if (state.reportTab === 'month') {
        await renderMonthlyReport();
      } else {
        await renderAnnualReport();
      }
    }

    /**
     * 渲染月報表：圓餅圖、各分類支出總計、子分類展開鑽取
     */
    async function renderMonthlyReport() {
      const curYearMonth = `${state.reportYear}-${String(state.reportMonth).padStart(2, '0')}`;
      const monthStart = `${curYearMonth}-01`;
      const monthEnd = `${curYearMonth}-31`;

      const monthRecords = await db.records
        .where('date')
        .between(monthStart, monthEnd, true, true)
        .toArray();

      let monthExp = 0;
      let monthInc = 0;

      // 分類統計結構：主分類 -> { info, total, count, subCats: { [subId]: { info, total, count } } }
      const catExpenseMap = {};

      const catMap = {};
      state.allCategories.forEach(c => { catMap[c.id] = c; });

      for (const rec of monthRecords) {
        if (rec.type === 'expense') {
          monthExp += rec.amount;
          const parentCat = catMap[rec.parentCategoryId] || { id: 'other', name: '其他', icon: 'asset/category/other.png' };
          const pId = parentCat.id || 'other';

          if (!catExpenseMap[pId]) {
            catExpenseMap[pId] = {
              id: pId,
              name: parentCat.name,
              icon: parentCat.icon,
              total: 0,
              count: 0,
              subCats: {}
            };
          }

          catExpenseMap[pId].total += rec.amount;
          catExpenseMap[pId].count += 1;

          // 子分類統計
          const subCat = catMap[rec.subCategoryId] || { id: 'default', name: '一般', icon: parentCat.icon };
          const sId = subCat.id || 'default';

          if (!catExpenseMap[pId].subCats[sId]) {
            catExpenseMap[pId].subCats[sId] = {
              id: sId,
              name: subCat.name,
              icon: subCat.icon,
              total: 0,
              count: 0
            };
          }

          catExpenseMap[pId].subCats[sId].total += rec.amount;
          catExpenseMap[pId].subCats[sId].count += 1;
        } else if (rec.type === 'income') {
          monthInc += rec.amount;
        }
      }

      // 更新本月收支小卡
      const expEl = document.getElementById('stat-month-expense');
      const incEl = document.getElementById('stat-month-income');
      const balEl = document.getElementById('stat-month-balance');

      if (expEl) expEl.textContent = `NT$ ${monthExp.toLocaleString()}`;
      if (incEl) incEl.textContent = `NT$ ${monthInc.toLocaleString()}`;
      if (balEl) balEl.textContent = `NT$ ${(monthInc - monthExp).toLocaleString()}`;

      // 圓餅圖 (Doughnut Chart) 排序與取色
      const sortedCats = Object.values(catExpenseMap).sort((a, b) => b.total - a.total);
      const labels = sortedCats.map(c => c.name);
      const data = sortedCats.map(c => c.total);

      const colorPalette = [
        '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6',
        '#f97316', '#a855f7'
      ];

      // 1. 繪製左側甜甜圈圓餅圖 (不使用 Chart.js 內建 legend)
      const ctx = document.getElementById('categoryExpenseChart').getContext('2d');
      if (state.chartInstance) state.chartInstance.destroy();

      if (labels.length === 0) {
        state.chartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: ['本月尚無支出'],
            datasets: [{
              data: [1],
              backgroundColor: ['#27272a']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            }
          }
        });
      } else {
        state.chartInstance = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: colorPalette.slice(0, labels.length),
              borderWidth: 2,
              borderColor: '#18181b'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const val = context.raw || 0;
                    const pct = monthExp > 0 ? ((val / monthExp) * 100).toFixed(1) : 0;
                    return ` ${context.label}: NT$ ${val.toLocaleString()} (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }

      // 2. 渲染右側分類與佔比(%)列表
      const legendListEl = document.getElementById('report-pie-legend-list');
      if (legendListEl) {
        if (sortedCats.length === 0) {
          legendListEl.innerHTML = `<div class="text-xs text-zinc-500 py-6 text-center">尚無支出資料</div>`;
        } else {
          legendListEl.innerHTML = sortedCats.map((cat, idx) => {
            const pct = monthExp > 0 ? ((cat.total / monthExp) * 100).toFixed(1) : '0.0';
            const color = colorPalette[idx % colorPalette.length];
            return `
              <div class="flex items-center text-xs py-0.5 pl-4">
                <div class="flex items-center gap-1.5 w-[80px] min-w-0 pr-1">
                  <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background-color: ${color}"></span>
                  <span class="text-zinc-200 font-medium truncate text-xs" title="${cat.name}">${cat.name}</span>
                </div>
                <span class="font-mono text-zinc-400 font-bold text-xs flex-shrink-0 text-right w-12">${pct}%</span>
              </div>
            `;
          }).join('');
        }
      }

      // 3. 渲染分類支出總計排行榜（顯示：分類名稱、佔比、金額，點選展開子分類）
      renderReportCategoryRankList(sortedCats, monthExp);

      // 4. 渲染預算進度
      await renderReportBudgets(curYearMonth);
    }

    /**
     * 渲染各分類支出排行統計欄位：
     * 依要求顯示：分類名稱、佔比、金額
     * 點選分類後展開子分類金額 (例：早餐：100  午餐：200  晚餐：200)
     */
    function renderReportCategoryRankList(sortedCats, totalMonthExp) {
      const listEl = document.getElementById('report-category-rank-list');
      if (!listEl) return;

      if (sortedCats.length === 0) {
        listEl.innerHTML = `
          <div class="p-6 text-center text-xs text-zinc-500 bg-zinc-900/50 rounded-2xl border border-zinc-800/80">
            本月尚無任何支出記錄
          </div>
        `;
        return;
      }

      listEl.innerHTML = sortedCats.map(cat => {
        const pct = totalMonthExp > 0 ? ((cat.total / totalMonthExp) * 100).toFixed(1) : '0.0';
        // 使用字串一致比對避免 number/string 型態不匹配
        const isExpanded = state.reportExpandedCatId && String(state.reportExpandedCatId) === String(cat.id);

        // 子分類明細列表：依金額高至低排列
        const subCatsList = Object.values(cat.subCats).sort((a, b) => b.total - a.total);
        const subCatsHtml = subCatsList.map(sub => {
          return `
            <div class="flex items-center justify-between py-1.5 px-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80 text-xs">
              <span class="text-zinc-300 font-medium">${sub.name}</span>
              <span class="font-mono font-bold text-zinc-100">NT$ ${sub.total.toLocaleString()}</span>
            </div>
          `;
        }).join('');

        return `
          <div class="p-3 bg-zinc-900 rounded-2xl border ${isExpanded ? 'border-amber-500/50 bg-zinc-900/90' : 'border-zinc-800'} hover:border-zinc-700 transition cursor-pointer shadow-sm select-none" onclick="toggleReportCategoryDetail('${cat.id}')">
            <!-- 主分類列：分類名稱 | 佔比 | 金額 -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-8 h-8 rounded-xl bg-zinc-800/80 flex items-center justify-center p-1.5 border border-zinc-700/50 flex-shrink-0">
                  <img src="${cat.icon}" class="w-full h-full object-contain" onerror="this.src='asset/category/other.png'">
                </div>
                <span class="text-sm font-bold text-zinc-100 truncate">${cat.name}</span>
              </div>

              <div class="flex items-center gap-3 flex-shrink-0">
                <span class="text-xs font-mono font-semibold text-zinc-400">${pct}%</span>
                <span class="text-sm font-mono font-bold text-amber-400">NT$ ${cat.total.toLocaleString()}</span>
                <i data-lucide="${isExpanded ? 'chevron-up' : 'chevron-down'}" class="w-4 h-4 text-zinc-500"></i>
              </div>
            </div>

            <!-- 點選展開子分類金額區塊 -->
            ${isExpanded ? `
              <div class="mt-3 pt-2.5 border-t border-zinc-800 space-y-1.5" onclick="event.stopPropagation()">
                <div class="text-[11px] font-bold text-zinc-400 px-1 mb-1">子分類支出明細：</div>
                ${subCatsHtml || '<div class="text-xs text-zinc-500 text-center py-2">無子分類支出紀錄</div>'}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    function toggleReportCategoryDetail(catId) {
      const strId = String(catId);
      state.reportExpandedCatId = (state.reportExpandedCatId && String(state.reportExpandedCatId) === strId) ? null : strId;
      renderMonthlyReport();
      lucide.createIcons();
    }

    /**
     * 渲染年度報表：
     * 1. 長條圖 (單一項目切換：預設總支出，可切換總收入、每月結餘)
     * 2. 年度分類圓餅圖 (左右呈現，保留名稱與總支出，新增年度總結餘，右側顯示佔比%)
     */
    async function renderAnnualReport() {
      const yearStr = String(state.reportYear);
      const yearStart = `${yearStr}-01-01`;
      const yearEnd = `${yearStr}-12-31`;

      const records = await db.records
        .where('date')
        .between(yearStart, yearEnd, true, true)
        .toArray();

      const monthlyExp = Array(12).fill(0);
      const monthlyInc = Array(12).fill(0);
      const monthlyBal = Array(12).fill(0);

      const catMap = {};
      state.allCategories.forEach(c => { catMap[c.id] = c; });

      const annualCatExpenseMap = {};

      for (const rec of records) {
        if (!rec.date) continue;
        const m = parseInt(rec.date.slice(5, 7), 10) - 1;
        if (m < 0 || m > 11) continue;

        if (rec.type === 'expense') {
          monthlyExp[m] += rec.amount;
          const pCat = catMap[rec.parentCategoryId] || { name: '其他' };
          const pName = pCat.name || '其他';
          annualCatExpenseMap[pName] = (annualCatExpenseMap[pName] || 0) + rec.amount;
        } else if (rec.type === 'income') {
          monthlyInc[m] += rec.amount;
        }
      }

      for (let i = 0; i < 12; i++) {
        monthlyBal[i] = monthlyInc[i] - monthlyExp[i];
      }

      const totalYearExp = monthlyExp.reduce((a, b) => a + b, 0);
      const totalYearInc = monthlyInc.reduce((a, b) => a + b, 0);
      const totalYearBal = totalYearInc - totalYearExp;

      // 更新年度收支統計頂部小卡
      const yearExpEl = document.getElementById('stat-year-expense');
      const yearIncEl = document.getElementById('stat-year-income');
      const yearBalEl = document.getElementById('stat-year-balance');
      const annualPieTotalEl = document.getElementById('report-annual-pie-total');
      const annualPieBalEl = document.getElementById('report-annual-pie-balance');

      if (yearExpEl) yearExpEl.textContent = `NT$ ${totalYearExp.toLocaleString()}`;
      if (yearIncEl) yearIncEl.textContent = `NT$ ${totalYearInc.toLocaleString()}`;
      if (yearBalEl) yearBalEl.textContent = `NT$ ${totalYearBal.toLocaleString()}`;
      if (annualPieTotalEl) annualPieTotalEl.textContent = `NT$ ${totalYearExp.toLocaleString()}`;
      if (annualPieBalEl) {
        annualPieBalEl.textContent = `NT$ ${totalYearBal.toLocaleString()}`;
        annualPieBalEl.className = totalYearBal >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold';
      }

      // ==========================================
      // 1. 每月趨勢長條圖 (依切換只顯示單一項目)
      // ==========================================
      const metric = state.annualBarMetric || 'expense';
      const btnExp = document.getElementById('annual-bar-tab-expense');
      const btnInc = document.getElementById('annual-bar-tab-income');
      const btnBal = document.getElementById('annual-bar-tab-balance');

      if (btnExp) {
        btnExp.className = metric === 'expense'
          ? 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all bg-amber-500 text-zinc-950 shadow'
          : 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all text-zinc-400 hover:text-zinc-200';
      }
      if (btnInc) {
        btnInc.className = metric === 'income'
          ? 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all bg-emerald-500 text-zinc-950 shadow'
          : 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all text-zinc-400 hover:text-zinc-200';
      }
      if (btnBal) {
        btnBal.className = metric === 'balance'
          ? 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all bg-blue-500 text-zinc-950 shadow'
          : 'px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all text-zinc-400 hover:text-zinc-200';
      }

      let activeLabel = '每月總支出';
      let activeData = monthlyExp;
      let activeBgColor = '#f59e0b';

      if (metric === 'income') {
        activeLabel = '每月總收入';
        activeData = monthlyInc;
        activeBgColor = '#10b981';
      } else if (metric === 'balance') {
        activeLabel = '每月結餘';
        activeData = monthlyBal;
        activeBgColor = '#3b82f6';
      }

      const barCtx = document.getElementById('annualBarChart').getContext('2d');
      if (state.annualBarChartInstance) state.annualBarChartInstance.destroy();

      const monthLabels = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

      state.annualBarChartInstance = new Chart(barCtx, {
        type: 'bar',
        data: {
          labels: monthLabels,
          datasets: [{
            label: activeLabel,
            data: activeData,
            backgroundColor: activeBgColor,
            borderRadius: 4,
            barPercentage: 0.65,
            maxBarThickness: 32
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return ` ${context.dataset.label}: NT$ ${(context.raw || 0).toLocaleString()}`;
                }
              }
            }
          },
          scales: {
            x: {
              ticks: { color: '#a1a1aa', font: { size: 10 } },
              grid: { color: '#27272a' }
            },
            y: {
              ticks: {
                color: '#a1a1aa',
                font: { size: 10 },
                callback: function(value) {
                  if (Math.abs(value) >= 10000) {
                    return (value / 10000) + '萬';
                  }
                  return value;
                }
              },
              grid: { color: '#27272a' }
            }
          }
        }
      });

      // ==========================================
      // 2. 年度分類支出圓餅圖 (左右呈現，右側顯示佔比%)
      // ==========================================
      const pieCtx = document.getElementById('annualPieChart').getContext('2d');
      if (state.annualPieChartInstance) state.annualPieChartInstance.destroy();

      const sortedCatEntries = Object.entries(annualCatExpenseMap).sort((a, b) => b[1] - a[1]);
      const pieLabels = sortedCatEntries.map(e => e[0]);
      const pieData = sortedCatEntries.map(e => e[1]);

      const colorPalette = [
        '#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#eab308', '#6366f1', '#14b8a6',
        '#f97316', '#a855f7'
      ];

      if (pieLabels.length === 0) {
        state.annualPieChartInstance = new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: ['本年度尚無支出'],
            datasets: [{
              data: [1],
              backgroundColor: ['#27272a']
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: { enabled: false }
            }
          }
        });
      } else {
        state.annualPieChartInstance = new Chart(pieCtx, {
          type: 'doughnut',
          data: {
            labels: pieLabels,
            datasets: [{
              data: pieData,
              backgroundColor: colorPalette.slice(0, pieLabels.length),
              borderWidth: 2,
              borderColor: '#18181b'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const val = context.raw || 0;
                    const pct = totalYearExp > 0 ? ((val / totalYearExp) * 100).toFixed(1) : 0;
                    return ` ${context.label}: NT$ ${val.toLocaleString()} (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }

      // 渲染年度圓餅圖右側分類名稱與佔比(%)列表
      const annualLegendListEl = document.getElementById('report-annual-pie-legend-list');
      if (annualLegendListEl) {
        if (sortedCatEntries.length === 0) {
          annualLegendListEl.innerHTML = `<div class="text-xs text-zinc-500 py-6 text-center">本年度尚無支出</div>`;
        } else {
          annualLegendListEl.innerHTML = sortedCatEntries.map((entry, idx) => {
            const name = entry[0];
            const amount = entry[1];
            const pct = totalYearExp > 0 ? ((amount / totalYearExp) * 100).toFixed(1) : '0.0';
            const color = colorPalette[idx % colorPalette.length];
            return `
              <div class="flex items-center text-xs py-0.5 pl-4">
                <div class="flex items-center gap-1.5 w-[80px] min-w-0 pr-1">
                  <span class="w-2.5 h-2.5 rounded-sm flex-shrink-0" style="background-color: ${color}"></span>
                  <span class="text-zinc-200 font-medium truncate text-xs" title="${name}">${name}</span>
                </div>
                <span class="font-mono text-zinc-400 font-bold text-xs flex-shrink-0 text-right w-12">${pct}%</span>
              </div>
            `;
          }).join('');
        }
      }
    }

    /**
     * 切換年度長條圖顯示項目 (總支出 / 總收入 / 每月結餘)
     */
    async function switchAnnualBarMetric(metric) {
      if (state.annualBarMetric === metric) return;
      state.annualBarMetric = metric;
      await renderAnnualReport();
      lucide.createIcons();
    }

    async function renderReportBudgets(currentYearMonth) {
      const labelEl = document.getElementById('report-budget-month-label');
      const pctEl = document.getElementById('report-budget-overall-percent');
      const barEl = document.getElementById('report-budget-overall-bar');
      const spentEl = document.getElementById('report-budget-overall-spent');
      const totalEl = document.getElementById('report-budget-overall-total');
      const remainEl = document.getElementById('report-budget-overall-remaining');
      const tagEl = document.getElementById('report-budget-status-tag');
      const overspentListEl = document.getElementById('report-budget-overspent-list');
      const containerEl = document.getElementById('report-budget-overspent-container');
      const expandIcon = document.getElementById('report-budget-expand-icon');

      const [year, month] = currentYearMonth.split('-');
      if (labelEl) labelEl.textContent = `${year}年 ${parseInt(month, 10)}月 預算達成狀況`;

      // 查詢當月所有支出
      const monthStart = `${currentYearMonth}-01`;
      const monthEnd = `${currentYearMonth}-31`;
      const monthRecords = await db.records
        .where('date')
        .between(monthStart, monthEnd, true, true)
        .filter(r => r.type === 'expense')
        .toArray();

      const catSpentMap = {};
      let totalSpent = 0;
      for (const r of monthRecords) {
        if (r.parentCategoryId) {
          catSpentMap[r.parentCategoryId] = (catSpentMap[r.parentCategoryId] || 0) + r.amount;
        }
        totalSpent += r.amount;
      }

      const expenseParents = state.allCategories.filter(
        c => c.type === 'expense' && c.parentId === null && !c.isArchived
      );

      let totalBudget = 0;
      expenseParents.forEach(c => {
        totalBudget += (c.budgetMonthly || 0);
      });

      if (spentEl) spentEl.textContent = `NT$ ${totalSpent.toLocaleString()}`;
      if (totalEl) totalEl.textContent = totalBudget > 0 ? `NT$ ${totalBudget.toLocaleString()}` : '未設預算';

      // 篩選出「超支」的主分類 (budget > 0 且 spent > budget)
      const overspentCats = expenseParents
        .map(c => {
          const spent = catSpentMap[c.id] || 0;
          const budget = c.budgetMonthly || 0;
          const overspent = spent - budget;
          const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
          return { ...c, spent, budget, overspent, pct };
        })
        .filter(c => c.budget > 0 && c.overspent > 0)
        .sort((a, b) => b.overspent - a.overspent);

      if (totalBudget > 0) {
        const overallRatio = totalSpent / totalBudget;
        const overallPct = Math.round(overallRatio * 100);
        if (pctEl) pctEl.textContent = `${overallPct}%`;

        const displayWidth = Math.min(100, Math.max(0, overallPct));
        if (barEl) barEl.style.width = `${displayWidth}%`;

        if (overallPct > 100) {
          if (barEl) barEl.className = 'h-full bg-red-500 rounded-full transition-all duration-300';
          if (pctEl) pctEl.className = 'text-xs font-mono font-extrabold text-red-400';
          if (remainEl) {
            remainEl.textContent = `超支 NT$ ${(totalSpent - totalBudget).toLocaleString()}`;
            remainEl.className = 'text-sm font-bold font-mono text-red-400 mt-0.5';
          }
        } else if (overallPct > 80) {
          if (barEl) barEl.className = 'h-full bg-orange-500 rounded-full transition-all duration-300';
          if (pctEl) pctEl.className = 'text-xs font-mono font-extrabold text-orange-400';
          if (remainEl) {
            remainEl.textContent = `剩餘 NT$ ${(totalBudget - totalSpent).toLocaleString()}`;
            remainEl.className = 'text-sm font-bold font-mono text-orange-400 mt-0.5';
          }
        } else {
          if (barEl) barEl.className = 'h-full bg-emerald-500 rounded-full transition-all duration-300';
          if (pctEl) pctEl.className = 'text-xs font-mono font-extrabold text-emerald-400';
          if (remainEl) {
            remainEl.textContent = `剩餘 NT$ ${(totalBudget - totalSpent).toLocaleString()}`;
            remainEl.className = 'text-sm font-bold font-mono text-emerald-400 mt-0.5';
          }
        }
      } else {
        if (pctEl) pctEl.textContent = '--';
        if (barEl) {
          barEl.style.width = totalSpent > 0 ? '100%' : '0%';
          barEl.className = 'h-full bg-zinc-600 rounded-full transition-all duration-300';
        }
        if (remainEl) {
          remainEl.textContent = '--';
          remainEl.className = 'text-sm font-bold font-mono text-zinc-400 mt-0.5';
        }
      }

      // 更新點選狀態標籤 (Tag)
      if (tagEl) {
        if (totalBudget === 0) {
          tagEl.textContent = '未設預算';
          tagEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-medium';
        } else if (overspentCats.length > 0) {
          tagEl.textContent = `超支 ${overspentCats.length} 項 (點選查看)`;
          tagEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-red-950/80 text-red-400 border border-red-800/80 font-bold';
        } else {
          tagEl.textContent = '無超支項目';
          tagEl.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-medium';
        }
      }

      // 保持或更新展開容器之狀態
      if (containerEl) {
        containerEl.classList.toggle('hidden', !state.reportBudgetExpanded);
      }
      if (expandIcon) {
        expandIcon.setAttribute('data-lucide', state.reportBudgetExpanded ? 'chevron-up' : 'chevron-down');
      }

      // 渲染超支列表：排版風格同分類支出排行統計
      if (overspentListEl) {
        if (overspentCats.length === 0) {
          overspentListEl.innerHTML = `
            <div class="py-3 px-4 text-center text-xs text-emerald-400 bg-emerald-950/20 border border-emerald-900/40 rounded-xl">
              本月各分類支出均在預算內，無任何超支項目！ 🎉
            </div>
          `;
        } else {
          overspentListEl.innerHTML = overspentCats.map(c => {
            return `
              <div class="p-2.5 bg-zinc-950/80 rounded-xl border border-red-900/50 flex items-center justify-between text-xs">
                <div class="flex items-center gap-2.5 min-w-0">
                  <div class="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center p-1 border border-zinc-700/50 flex-shrink-0">
                    <img src="${c.icon}" class="w-full h-full object-contain" onerror="this.src='asset/category/other.png'">
                  </div>
                  <div class="min-w-0">
                    <div class="text-xs font-bold text-zinc-100 truncate">${c.name}</div>
                    <div class="text-[10px] text-zinc-400 font-mono mt-0.5">
                      預算 NT$ ${c.budget.toLocaleString()} / 已花 NT$ ${c.spent.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div class="text-right flex-shrink-0">
                  <div class="text-xs font-bold font-mono text-red-400">
                    超支 NT$ ${c.overspent.toLocaleString()}
                  </div>
                  <div class="text-[10px] font-mono text-red-400/80 mt-0.5 font-bold">
                    ${c.pct}%
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    }

    function toggleReportBudgetDetail() {
      state.reportBudgetExpanded = !state.reportBudgetExpanded;
      const containerEl = document.getElementById('report-budget-overspent-container');
      const expandIcon = document.getElementById('report-budget-expand-icon');
      if (containerEl) {
        containerEl.classList.toggle('hidden', !state.reportBudgetExpanded);
      }
      if (expandIcon) {
        expandIcon.setAttribute('data-lucide', state.reportBudgetExpanded ? 'chevron-up' : 'chevron-down');
      }
      lucide.createIcons();
    }

    /**
     * =========================================================================
     * Phase 4: 資料匯出 (XLSX / CSV / JSON) & 資料庫還原
     * =========================================================================
     */
    async function openBackupModal() {
      document.getElementById('backup-modal').classList.remove('hidden');
      renderGasSyncUI();

      // 初始化 Excel 匯出月份為當前月份 (YYYY-MM)
      const exportMonthInput = document.getElementById('export-xlsx-month');
      if (exportMonthInput && !exportMonthInput.value) {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        exportMonthInput.value = `${y}-${m}`;
      }

      const verEl = document.getElementById('app-current-version');
      if (verEl) {
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            const current = keys.find(k => k.startsWith('pocket-ledger-')) || '';
            const ver = current.replace('pocket-ledger-', '') || 'v4.1';
            verEl.textContent = ver.startsWith('v') ? ver : `v${ver}`;
          } catch (e) {
            verEl.textContent = 'v4.1';
          }
        } else {
          verEl.textContent = 'v4.1';
        }
      }
      lucide.createIcons();
    }

    function closeBackupModal() {
      document.getElementById('backup-modal').classList.add('hidden');
    }

    /**
     * 產出格式化交易紀錄清單 (依需求排除轉帳資料，可指定月份 YYYY-MM，日期由小至大排序)
     */
    async function getFormattedExportRows(targetMonth) {
      const records = await db.records.toArray();
      // 僅保留支出與收入紀錄，不需要轉帳
      let validRecords = records.filter(r => r.type === 'expense' || r.type === 'income');

      // 若指定月份 (YYYY-MM)，僅篩選該月份之紀錄
      if (targetMonth) {
        validRecords = validRecords.filter(r => r.date && r.date.startsWith(targetMonth));
      }

      // 依日期由小至大排序 (由舊至新)
      validRecords.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      const catMap = {};
      state.allCategories.forEach(c => { catMap[c.id] = c; });

      const accMap = {};
      state.allAccounts.forEach(a => { accMap[a.id] = a; });

      return validRecords.map(r => {
        const typeText = r.type === 'income' ? '收入' : '支出';
        const parentName = catMap[r.parentCategoryId]?.name || '';
        const subName = catMap[r.subCategoryId]?.name || '';
        const accName = accMap[r.accountId]?.name || '';

        return {
          '日期': r.date || '',
          '類型': typeText,
          '主分類': parentName,
          '子分類': subName,
          '帳戶': accName,
          '轉出／交易帳戶': accName,
          '轉入帳戶': '',
          '金額': Number(r.amount) || 0,
          '備註': r.note || '',
          date: r.date || '',
          type: typeText,
          parentName: parentName,
          subName: subName,
          accName: accName,
          amount: Number(r.amount) || 0,
          note: r.note || '',
          rawType: r.type,
          parentCategoryId: r.parentCategoryId
        };
      });
    }

    /**
     * 內建月報表範本 Base64 (用以在 file:// 協議跨域阻擋或離線快取未命中時，100% 確保載入完整樣式範本)
     */
    const MONTHLY_TEMPLATE_BASE64 = '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';

    function base64ToArrayBuffer(base64) {
      const binaryString = window.atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    }

    /**
     * 匯出 Excel (XLSX) - 套用 monthly_template.xlsx 範本 (優先使用 ExcelJS 以完整保留儲存格背景色與字體樣式)
     * @param {string} [customMonth] 可選指定月份，格式 "YYYY-MM"
     */
    async function exportXLSXRecords(customMonth) {
      try {
        let selectedMonth = customMonth;
        if (!selectedMonth) {
          const monthInput = document.getElementById('export-xlsx-month');
          selectedMonth = monthInput?.value;
        }

        // 若無輸入則預設當前月份
        if (!selectedMonth) {
          const now = new Date();
          const y = now.getFullYear();
          const m = String(now.getMonth() + 1).padStart(2, '0');
          selectedMonth = `${y}-${m}`;
        }

        const rows = await getFormattedExportRows(selectedMonth);
        const [year, month] = selectedMonth.split('-');

        if (rows.length === 0) {
          showToast(`${year}年${month}月尚無收支明細可匯出`, 'info');
          return;
        }

        const BASE_CATEGORIES = ['食物酒水', '居家物業', '行車交通', '3C通訊', '休閒娛樂', '進修學習', '人情往來', '保健醫療'];
        const sheetTitle = `${year}年${month}月明細`;

        // 彙總計算：總支出、總收入、結餘、各主分類支出小計
        let totalExpense = 0;
        let totalIncome = 0;
        const catExpenses = {};

        rows.forEach(r => {
          if (r.rawType === 'expense') {
            totalExpense += r.amount;
            const pName = r.parentName || '其它';
            catExpenses[pName] = (catExpenses[pName] || 0) + r.amount;
          } else if (r.rawType === 'income') {
            totalIncome += r.amount;
          }
        });
        const balance = totalIncome - totalExpense;

        // 整理橫向分類清單：以 8 大基準分類為主，自訂分類若有支出則向右延伸
        const categoryList = [...BASE_CATEGORIES];
        Object.keys(catExpenses).forEach(cat => {
          if (!categoryList.includes(cat)) {
            categoryList.push(cat);
          }
        });

        // 方案 1: 使用 ExcelJS (支援完整保留範本之背景色、字體顏色與框線)
        if (typeof ExcelJS !== 'undefined') {
          let wb = new ExcelJS.Workbook();
          let isLoaded = false;

          // 1. 優先透過 fetch 讀取外部最新範本
          try {
            const res = await fetch('./asset/template/monthly_template.xlsx');
            if (res.ok) {
              const ab = await res.arrayBuffer();
              await wb.xlsx.load(ab);
              isLoaded = true;
            }
          } catch (e) {
            console.warn('透過 fetch 讀取範本受阻（可能為 file:// 協議限制或離線），改由內建範本載入：', e);
          }

          // 2. 若 fetch 失敗（例如 file:// CORS 阻擋或無網路快取），使用內建 Base64 範本保證 100% 成功
          if (!isLoaded) {
            try {
              const ab = base64ToArrayBuffer(MONTHLY_TEMPLATE_BASE64);
              await wb.xlsx.load(ab);
              isLoaded = true;
            } catch (e) {
              console.error('內建 Base64 範本載入異常：', e);
            }
          }

          if (isLoaded && wb.worksheets.length > 0) {
            const ws = wb.worksheets[0];
            ws.name = sheetTitle;

            // A2: 大標題
            ws.getCell('A2').value = `${selectedMonth} 月報表`;

            // 取得 I 欄 (第 9 欄) 之樣本儲存格樣式，作為新擴充欄位的樣式複製來源
            const sampleHeaderCell = ws.getCell(4, 9);
            const sampleAmountCell = ws.getCell(5, 9);
            const samplePctCell = ws.getCell(6, 9);

            // Row 4 (分類)、Row 5 (總金額)、Row 6 (佔比) - 從 B 欄 (col=2) 開始填寫
            categoryList.forEach((catName, idx) => {
              const col = 2 + idx; // B is 2, C is 3...
              const cHead = ws.getCell(4, col);
              const cAmt = ws.getCell(5, col);
              const cPct = ws.getCell(6, col);

              cHead.value = catName;
              const amt = catExpenses[catName] || 0;
              cAmt.value = amt;
              const pct = totalExpense > 0 ? ((amt / totalExpense) * 100).toFixed(1) + '%' : '0.0%';
              cPct.value = pct;

              // 若向右延伸超出範本原有的 8 大分類 (col > 9)，自動複製相鄰樣式 (背景色、字型、框線)
              if (col > 9) {
                if (sampleHeaderCell.style) cHead.style = JSON.parse(JSON.stringify(sampleHeaderCell.style));
                if (sampleAmountCell.style) cAmt.style = JSON.parse(JSON.stringify(sampleAmountCell.style));
                if (samplePctCell.style) cPct.style = JSON.parse(JSON.stringify(samplePctCell.style));
              }
            });

            // Row 8: 總結指標
            ws.getCell('E8').value = totalIncome;  // 總收入
            ws.getCell('G8').value = totalExpense; // 總支出
            ws.getCell('I8').value = balance;      // 結餘

            // 清除範本原本殘留之明細列 (Row 11 開始)
            const currentTotalRows = ws.rowCount;
            for (let r = 11; r <= currentTotalRows; r++) {
              const row = ws.getRow(r);
              for (let c = 1; c <= 7; c++) {
                row.getCell(c).value = null;
              }
            }

            // 寫入排序好的交易明細 (日期由小至大，Row 11 起)
            const sampleDataRow = ws.getRow(11);
            rows.forEach((r, idx) => {
              const targetRow = ws.getRow(11 + idx);
              const vals = [r.date, r.type, r.parentName, r.subName, r.accName, r.amount, r.note];
              vals.forEach((v, cIdx) => {
                const cell = targetRow.getCell(1 + cIdx);
                cell.value = v;
                // 繼承範本明細列之字型、對齊與格式
                const sampleCell = sampleDataRow.getCell(1 + cIdx);
                if (sampleCell && sampleCell.style) {
                  if (sampleCell.font) cell.font = JSON.parse(JSON.stringify(sampleCell.font));
                  if (sampleCell.alignment) cell.alignment = JSON.parse(JSON.stringify(sampleCell.alignment));
                  if (sampleCell.border) cell.border = JSON.parse(JSON.stringify(sampleCell.border));
                }
              });
            });

            const outBuf = await wb.xlsx.writeBuffer();
            const blob = new Blob([outBuf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `PocketLedger_${year}_${month}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            showToast(`${year}年${month}月 Excel 試算表已成功匯出！`, 'success');
            return;
          }
        }

        // 方案 2: Fallback 備援 (使用 SheetJS XLSX)
        if (typeof XLSX !== 'undefined') {
          const wb = XLSX.utils.book_new();
          const sheetData = [];
          sheetData.push([`${selectedMonth} 月報表`]);
          sheetData.push([]);
          const rowCats = ['分類', ...categoryList];
          const rowAmts = ['總金額', ...categoryList.map(c => catExpenses[c] || 0)];
          const rowPcts = ['佔比', ...categoryList.map(c => totalExpense > 0 ? ((catExpenses[c] || 0) / totalExpense * 100).toFixed(1) + '%' : '0.0%')];
          sheetData.push(rowCats);
          sheetData.push(rowAmts);
          sheetData.push(rowPcts);
          sheetData.push([]);
          sheetData.push(['', '', '', '總收入：', totalIncome, '總支出：', totalExpense, '結餘：', balance]);
          sheetData.push([]);
          sheetData.push(['日期', '類型', '主分類', '子分類', '帳戶', '金額', '備註']);
          rows.forEach(r => {
            sheetData.push([r.date, r.type, r.parentName, r.subName, r.accName, r.amount, r.note]);
          });
          const ws = XLSX.utils.aoa_to_sheet(sheetData);
          XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
          XLSX.writeFile(wb, `PocketLedger_${year}_${month}.xlsx`);
          showToast(`${year}年${month}月 Excel 試算表已成功匯出！`, 'success');
          return;
        }

        showToast('找不到可用之 Excel 匯出模組', 'error');
      } catch (err) {
        console.error('Export XLSX Error:', err);
        showToast('匯出 Excel 失敗：' + err.message, 'error');
      }
    }

    /**
     * 從月報表頁面快速匯出當前檢視月份之 Excel
     */
    async function exportCurrentReportMonthXLSX() {
      const ym = `${state.reportYear}-${String(state.reportMonth).padStart(2, '0')}`;
      await exportXLSXRecords(ym);
    }

    window.exportXLSXRecords = exportXLSXRecords;
    window.exportCurrentReportMonthXLSX = exportCurrentReportMonthXLSX;

    /**
     * 匯出 CSV (UTF-8 加 BOM 避免 Excel 亂碼)
     */
    async function exportCSVRecords() {
      try {
        const rows = await getFormattedExportRows();
        if (rows.length === 0) {
          showToast('目前尚無記帳紀錄可匯出', 'info');
          return;
        }

        const headers = ['日期', '類型', '主分類', '子分類', '轉出／交易帳戶', '轉入帳戶', '金額', '備註'];
        const csvLines = [headers.join(',')];

        for (const row of rows) {
          const line = headers.map(h => {
            let val = String(row[h] !== undefined ? row[h] : '');
            // 特殊字元與引號處理
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              val = `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          }).join(',');
          csvLines.push(line);
        }

        // 加入 UTF-8 BOM (\uFEFF)
        const csvContent = '\uFEFF' + csvLines.join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateTag = getTodayString().replace(/-/g, '');
        a.href = url;
        a.download = `PocketLedger_Records_${dateTag}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('CSV 檔案已成功匯出下載！', 'success');
      } catch (err) {
        console.error('Export CSV Error:', err);
        showToast('匯出 CSV 失敗：' + err.message, 'error');
      }
    }

    /**
     * 匯出 JSON 完整資料庫備份
     */
    async function exportJSONBackup() {
      try {
        const data = {
          schemaVersion: 2,
          exportedAt: new Date().toISOString(),
          categories: await db.categories.toArray(),
          accounts: await db.accounts.toArray(),
          records: await db.records.toArray(),
          recurring: await db.recurring.toArray(),
          templates: await db.templates.toArray()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateTag = getTodayString().replace(/-/g, '');
        a.href = url;
        a.download = `PocketLedger_Backup_${dateTag}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('完整 JSON 備份檔已成功下載！', 'success');
      } catch (err) {
        console.error('Export JSON Error:', err);
        showToast('匯出 JSON 備份失敗', 'error');
      }
    }

    /**
     * 選擇還原檔案並進行格式檢查與彈出模式選擇
     */
    function onImportJSONSelected(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target.result);
          
          // 驗證結構與必要欄位
          if (!json || typeof json !== 'object' || !Array.isArray(json.categories) || !Array.isArray(json.accounts) || !Array.isArray(json.records)) {
            showToast('備份檔案格式不正確，缺少必要資料表', 'error');
            return;
          }

          state.pendingImportJSON = json;

          const summaryEl = document.getElementById('import-file-summary');
          if (summaryEl) {
            const expDate = json.exportedAt ? new Date(json.exportedAt).toLocaleString('zh-TW') : '未知時間';
            const schemaVer = json.schemaVersion || 1;
            summaryEl.innerHTML = `
              <div><strong>備份時間：</strong>${expDate}</div>
              <div><strong>規格版本：</strong>v${schemaVer}</div>
              <div class="grid grid-cols-2 gap-1 pt-1 text-zinc-400 border-t border-zinc-800">
                <span>帳戶：${json.accounts.length} 個</span>
                <span>分類：${json.categories.length} 個</span>
                <span>記帳：${json.records.length} 筆</span>
                <span>排程：${(json.recurring || []).length} 筆</span>
              </div>
            `;
          }

          document.getElementById('import-confirm-modal').classList.remove('hidden');
          lucide.createIcons();
        } catch (err) {
          console.error(err);
          showToast('無法解析此 JSON 備份檔案', 'error');
        } finally {
          // 清空 input 讓同檔名可以重複選取
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    }

    function closeImportConfirmModal() {
      state.pendingImportJSON = null;
      document.getElementById('import-confirm-modal').classList.add('hidden');
    }

    /**
     * 執行 JSON 資料還原 (overwrite 覆蓋還原 / merge 合併匯入)
     */
    async function executeJSONImport(mode) {
      const json = state.pendingImportJSON;
      if (!json) return;

      try {
        await db.transaction('rw', db.categories, db.accounts, db.records, db.recurring, db.templates, async () => {
          if (mode === 'overwrite') {
            // 完整覆蓋：清空目前全部資料表
            await db.categories.clear();
            await db.accounts.clear();
            await db.records.clear();
            await db.recurring.clear();
            await db.templates.clear();

            await db.categories.bulkAdd(json.categories);
            await db.accounts.bulkAdd(json.accounts);
            await db.records.bulkAdd(json.records);
            if (json.recurring && json.recurring.length > 0) {
              await db.recurring.bulkAdd(json.recurring);
            }
            if (json.templates && json.templates.length > 0) {
              await db.templates.bulkAdd(json.templates);
            }
          } else if (mode === 'merge') {
            // 合併匯入：比對已存在的 ID 或項目，補齊不存在的新資料
            const curCats = await db.categories.toArray();
            const curCatIds = new Set(curCats.map(c => c.id));
            const newCats = json.categories.filter(c => !curCatIds.has(c.id));
            if (newCats.length > 0) await db.categories.bulkAdd(newCats);

            const curAccs = await db.accounts.toArray();
            const curAccIds = new Set(curAccs.map(a => a.id));
            const newAccs = json.accounts.filter(a => !curAccIds.has(a.id));
            if (newAccs.length > 0) await db.accounts.bulkAdd(newAccs);

            const curRecs = await db.records.toArray();
            const curRecIds = new Set(curRecs.map(r => r.id));
            const newRecs = json.records.filter(r => !curRecIds.has(r.id));
            if (newRecs.length > 0) await db.records.bulkAdd(newRecs);

            if (json.recurring) {
              const curRecur = await db.recurring.toArray();
              const curRecurIds = new Set(curRecur.map(rc => rc.id));
              const newRecur = json.recurring.filter(rc => !curRecurIds.has(rc.id));
              if (newRecur.length > 0) await db.recurring.bulkAdd(newRecur);
            }

            if (json.templates) {
              const curTpl = await db.templates.toArray();
              const curTplIds = new Set(curTpl.map(t => t.id));
              const newTpl = json.templates.filter(t => !curTplIds.has(t.id));
              if (newTpl.length > 0) await db.templates.bulkAdd(newTpl);
            }
          }
        });

        closeImportConfirmModal();
        closeBackupModal();

        // 重新載入記憶體與 UI
        await loadAllData();
        await renderWeekStripCalendar();
        renderSubCategoryQuickPills();
        await renderTodayRecords();

        if (mode === 'overwrite') {
          showToast('資料庫已成功完整覆蓋還原！', 'success');
        } else {
          showToast('資料庫已成功合併匯入！', 'success');
        }
        notifyDataChanged();
      } catch (err) {
        console.error('Import Error:', err);
        showToast('還原資料庫時發生錯誤：' + err.message, 'error');
      }
    }

    function switchView(view) {
      // Home view handler
    }

    /**
     * =========================================================================
     * Phase 6: Google Apps Script (GAS) & Google Drive 雲端同步模組
     * =========================================================================
     */
    function initGasSyncModule() {
      state.gasUrl = localStorage.getItem('pocket_ledger_gas_url') || '';
      state.gasAutoSync = localStorage.getItem('pocket_ledger_gas_auto_sync') === 'true';
      state.lastSyncTime = localStorage.getItem('pocket_ledger_gas_last_sync') || '';
      updateSyncIndicator('idle');

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && state.hasUnsyncedChanges && state.gasAutoSync && state.gasUrl) {
          if (state.syncTimer) {
            clearTimeout(state.syncTimer);
            state.syncTimer = null;
          }
          triggerGasSync(false);
        }
      });

      window.addEventListener('online', () => {
        if (state.hasUnsyncedChanges && state.gasAutoSync && state.gasUrl) {
          triggerGasSync(false);
        } else {
          updateSyncIndicator(state.hasUnsyncedChanges ? 'dirty' : 'idle');
        }
      });

      window.addEventListener('offline', () => {
        updateSyncIndicator('offline');
      });
    }

    function setupDexieChangeHooks() {
      const tables = [db.records, db.accounts, db.categories, db.recurring, db.templates];
      tables.forEach(table => {
        table.hook('creating', function() {
          if (state.isReady) notifyDataChanged();
        });
        table.hook('updating', function() {
          if (state.isReady) notifyDataChanged();
        });
        table.hook('deleting', function() {
          if (state.isReady) notifyDataChanged();
        });
      });
    }

    function saveGasSettings(manualClick = false) {
      const urlInput = document.getElementById('gas-sync-url');
      const autoInput = document.getElementById('gas-sync-auto');
      if (urlInput) {
        const val = urlInput.value.trim();
        state.gasUrl = val;
        localStorage.setItem('pocket_ledger_gas_url', val);
      }
      if (autoInput) {
        state.gasAutoSync = autoInput.checked;
        localStorage.setItem('pocket_ledger_gas_auto_sync', autoInput.checked ? 'true' : 'false');
      }
      renderGasSyncUI();
      if (manualClick) {
        showToast('雲端同步設定已儲存', 'success');
      }
    }

    function renderGasSyncUI() {
      const urlInput = document.getElementById('gas-sync-url');
      const autoInput = document.getElementById('gas-sync-auto');
      const lastTimeEl = document.getElementById('gas-sync-last-time');
      const badgeEl = document.getElementById('gas-sync-badge');

      if (urlInput && urlInput.value !== state.gasUrl) {
        urlInput.value = state.gasUrl || '';
      }
      if (autoInput) {
        autoInput.checked = !!state.gasAutoSync;
      }
      if (lastTimeEl) {
        if (state.lastSyncTime) {
          try {
            const d = new Date(state.lastSyncTime);
            lastTimeEl.textContent = `最後同步：${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
          } catch(e) {
            lastTimeEl.textContent = `最後同步：${state.lastSyncTime}`;
          }
        } else {
          lastTimeEl.textContent = '尚未同步';
        }
      }
      if (badgeEl) {
        if (!state.gasUrl) {
          badgeEl.textContent = '未設定';
          badgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-800 text-zinc-400 border border-zinc-700';
        } else if (state.isSyncing) {
          badgeEl.textContent = '同步中';
          badgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700 animate-pulse';
        } else if (state.hasUnsyncedChanges) {
          badgeEl.textContent = '待同步';
          badgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-950 text-yellow-300 border border-yellow-700';
        } else {
          badgeEl.textContent = '已連線';
          badgeEl.className = 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700';
        }
      }
      updateSyncIndicator(state.isSyncing ? 'syncing' : (state.hasUnsyncedChanges ? 'dirty' : 'idle'));
    }

    function updateSyncIndicator(status) {
      const syncBtn = document.getElementById('header-sync-btn');
      const syncIcon = document.getElementById('header-sync-icon');
      const syncDot = document.getElementById('header-sync-dot');
      if (!syncBtn || !syncIcon || !syncDot) return;

      if (!state.gasUrl) {
        syncIcon.setAttribute('data-lucide', 'cloud-off');
        syncDot.classList.add('hidden');
        syncBtn.className = 'tap-scale p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/60 text-zinc-500 flex items-center justify-center shadow-sm relative';
        lucide.createIcons();
        return;
      }

      if (status === 'syncing') {
        syncIcon.setAttribute('data-lucide', 'refresh-cw');
        syncIcon.classList.add('animate-spin', 'text-amber-400');
        syncDot.classList.add('hidden');
        syncBtn.className = 'tap-scale p-2 rounded-xl bg-amber-950/40 hover:bg-amber-900/40 border border-amber-600/50 text-amber-300 flex items-center justify-center shadow-sm relative';
      } else if (status === 'dirty') {
        syncIcon.setAttribute('data-lucide', 'cloud');
        syncIcon.classList.remove('animate-spin', 'text-amber-400');
        syncDot.classList.remove('hidden', 'bg-emerald-500', 'bg-red-500');
        syncDot.classList.add('bg-amber-400');
        syncBtn.className = 'tap-scale p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/60 text-amber-400 flex items-center justify-center shadow-sm relative';
      } else if (status === 'offline') {
        syncIcon.setAttribute('data-lucide', 'cloud-off');
        syncIcon.classList.remove('animate-spin');
        syncDot.classList.remove('hidden', 'bg-emerald-500', 'bg-amber-400');
        syncDot.classList.add('bg-red-500');
        syncBtn.className = 'tap-scale p-2 rounded-xl bg-zinc-800/90 border border-zinc-700/60 text-red-400 flex items-center justify-center shadow-sm relative';
      } else {
        syncIcon.setAttribute('data-lucide', 'cloud');
        syncIcon.classList.remove('animate-spin', 'text-amber-400');
        syncDot.classList.remove('hidden', 'bg-amber-400', 'bg-red-500');
        syncDot.classList.add('bg-emerald-500');
        syncBtn.className = 'tap-scale p-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700/80 border border-zinc-700/60 text-emerald-400 flex items-center justify-center shadow-sm relative';
      }
      lucide.createIcons();
    }

    function notifyDataChanged() {
      state.hasUnsyncedChanges = true;
      renderGasSyncUI();

      if (!state.gasUrl || !state.gasAutoSync) {
        return;
      }

      if (state.syncTimer) {
        clearTimeout(state.syncTimer);
      }

      // 防抖 8 秒
      state.syncTimer = setTimeout(() => {
        triggerGasSync(false);
      }, 8000);
    }

    async function triggerGasSync(manual = false) {
      if (!state.gasUrl) {
        if (manual) {
          showToast('請先填寫 Google Apps Script 網頁應用程式網址', 'info');
          openBackupModal();
        }
        return;
      }

      if (!navigator.onLine) {
        if (manual) showToast('目前處於離線狀態，無法同步', 'error');
        updateSyncIndicator('offline');
        return;
      }

      if (state.isSyncing) return;

      const btn = document.getElementById('btn-gas-sync-now');
      const text = document.getElementById('text-gas-sync-now');
      const originalText = text ? text.textContent : '立即上傳備份';

      try {
        state.isSyncing = true;
        if (text) text.textContent = '同步中...';
        if (btn) btn.disabled = true;
        renderGasSyncUI();

        const payload = {
          schemaVersion: 2,
          exportedAt: new Date().toISOString(),
          environment: (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'development' : 'production',
          categories: await db.categories.toArray(),
          accounts: await db.accounts.toArray(),
          records: await db.records.toArray(),
          recurring: await db.recurring.toArray(),
          templates: await db.templates.toArray()
        };

        const response = await fetch(state.gasUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result && result.status === 'success') {
          state.hasUnsyncedChanges = false;
          state.lastSyncTime = new Date().toISOString();
          localStorage.setItem('pocket_ledger_gas_last_sync', state.lastSyncTime);
          if (manual) {
            showToast('已成功同步備份至 Google Drive！', 'success');
          }
        } else {
          throw new Error(result?.message || '上傳回應未回傳成功');
        }
      } catch (err) {
        console.error('GAS Sync Error:', err);
        if (manual) {
          showToast(`雲端同步失敗: ${err.message || err}`, 'error');
        }
      } finally {
        state.isSyncing = false;
        if (text) text.textContent = originalText;
        if (btn) btn.disabled = false;
        renderGasSyncUI();
      }
    }

    async function restoreFromGas() {
      if (!state.gasUrl) {
        showToast('請先填寫 Google Apps Script 網頁應用程式網址', 'info');
        return;
      }

      if (!navigator.onLine) {
        showToast('目前處於離線狀態，無法下載備份', 'error');
        return;
      }

      const btn = document.getElementById('btn-gas-restore-now');
      const text = document.getElementById('text-gas-restore-now');
      const originalText = text ? text.textContent : '從 Google Drive 還原';

      try {
        if (text) text.textContent = '正在拉取...';
        if (btn) btn.disabled = true;

        const response = await fetch(state.gasUrl, {
          method: 'GET'
        });

        const json = await response.json();
        if (!json || typeof json !== 'object' || !Array.isArray(json.categories) || !Array.isArray(json.accounts) || !Array.isArray(json.records)) {
          throw new Error('雲端備份資料格式不正確或為空');
        }

        state.pendingImportJSON = json;
        const summaryEl = document.getElementById('import-file-summary');
        if (summaryEl) {
          const expDate = json.exportedAt ? new Date(json.exportedAt).toLocaleString('zh-TW') : '未知時間';
          const envTag = json.environment === 'development' ? ' (開發測試版)' : '';
          summaryEl.innerHTML = `
            <div class="text-amber-400 font-bold flex items-center gap-1 mb-1">
              <i data-lucide="cloud" class="w-3.5 h-3.5"></i>
              <span>來源：Google Drive 雲端備份${envTag}</span>
            </div>
            <div><strong>備份時間：</strong>${expDate}</div>
            <div class="grid grid-cols-2 gap-1 pt-1 text-zinc-400 border-t border-zinc-800">
              <span>帳戶：${json.accounts.length} 個</span>
              <span>分類：${json.categories.length} 個</span>
              <span>記帳：${json.records.length} 筆</span>
              <span>排程：${(json.recurring || []).length} 筆</span>
            </div>
          `;
        }

        document.getElementById('import-confirm-modal').classList.remove('hidden');
        lucide.createIcons();
      } catch (err) {
        console.error('GAS Restore Error:', err);
        showToast(`從雲端拉取備份失敗: ${err.message || err}`, 'error');
      } finally {
        if (text) text.textContent = originalText;
        if (btn) btn.disabled = false;
      }
    }

    /**
     * =========================================================================
     * Phase 3: 固定收支排程 (Recurring Transactions & Scheduler - 純每月模式)
     * =========================================================================
     */
    function getNextMonthlyDate(currentDateStr, dayOfMonth) {
      const parts = currentDateStr.split('-').map(Number);
      let y = parts[0];
      let m = parts[1]; // 1-12
      m += 1;
      if (m > 12) {
        y += 1;
        m = 1;
      }
      const maxDay = new Date(y, m, 0).getDate();
      const actualDay = Math.min(dayOfMonth, maxDay);
      return `${y}-${String(m).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
    }

    function calculateInitialNextRunDate(targetDay) {
      const today = new Date();
      const curYear = today.getFullYear();
      const curMonth = today.getMonth() + 1;
      const curDate = today.getDate();

      const dom = parseInt(targetDay, 10) || 1;
      const maxDayThisMonth = new Date(curYear, curMonth, 0).getDate();
      const actualThisMonthDay = Math.min(dom, maxDayThisMonth);

      if (curDate <= actualThisMonthDay) {
        return `${curYear}-${String(curMonth).padStart(2, '0')}-${String(actualThisMonthDay).padStart(2, '0')}`;
      } else {
        let nextM = curMonth + 1;
        let nextY = curYear;
        if (nextM > 12) {
          nextM = 1;
          nextY += 1;
        }
        const maxDayNextMonth = new Date(nextY, nextM, 0).getDate();
        const actualNextMonthDay = Math.min(dom, maxDayNextMonth);
        return `${nextY}-${String(nextM).padStart(2, '0')}-${String(actualNextMonthDay).padStart(2, '0')}`;
      }
    }

    /**
     * 啟動時自動檢查並補登固定收支
     */
    async function checkAndApplyRecurring() {
      try {
        const todayStr = getTodayString();
        const recurringList = await db.recurring.filter(r => r.isActive === true || r.isActive === 1).toArray();
        if (!recurringList || recurringList.length === 0) return;

        let generatedCount = 0;

        for (const rule of recurringList) {
          if (!rule.nextRunDate) continue;

          let currentRunDate = rule.nextRunDate;
          let ruleModified = false;
          let safetyLoop = 0;

          while (currentRunDate <= todayStr && safetyLoop < 36) {
            safetyLoop++;

            // 嚴密防呆：檢查同一個 recurringId 與日期是否已存在 records
            const existing = await db.records
              .where('recurringId')
              .equals(rule.id)
              .filter(r => r.date === currentRunDate)
              .first();

            if (!existing) {
              const newRec = {
                type: rule.type,
                amount: rule.amount,
                parentCategoryId: rule.parentCategoryId,
                subCategoryId: rule.subCategoryId || null,
                accountId: rule.accountId,
                targetAccountId: null,
                date: currentRunDate,
                note: rule.note ? `${rule.note} (固定收支)` : '固定收支自動記帳',
                recurringId: rule.id,
                createdAt: Date.now()
              };
              await db.records.add(newRec);
              generatedCount++;
            }

            rule.lastGeneratedDate = currentRunDate;
            ruleModified = true;

            // 每月推進
            currentRunDate = getNextMonthlyDate(currentRunDate, rule.dayOfMonth || 1);
          }

          if (ruleModified) {
            rule.nextRunDate = currentRunDate;
            await db.recurring.put(rule);
          }
        }

        if (generatedCount > 0) {
          showToast(`已自動完成 ${generatedCount} 筆固定收支入帳！`, 'success');
        }
      } catch (err) {
        console.error('checkAndApplyRecurring error:', err);
      }
    }

    async function openRecurringModal() {
      document.getElementById('recurring-modal').classList.remove('hidden');
      await renderRecurringList();
      lucide.createIcons();
    }

    function closeRecurringModal() {
      document.getElementById('recurring-modal').classList.add('hidden');
    }

    async function renderRecurringList() {
      const container = document.getElementById('recurring-list-container');
      const list = await db.recurring.toArray();

      if (list.length === 0) {
        container.innerHTML = `
          <div class="py-10 text-center space-y-2">
            <div class="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-500">
              <i data-lucide="repeat" class="w-6 h-6"></i>
            </div>
            <div class="text-sm font-bold text-zinc-400">目前尚無固定收支排程</div>
            <div class="text-xs text-zinc-500">點擊右上角「新增排程」可建立每月房租、薪資等定期收支</div>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      container.innerHTML = list.map(r => {
        const pCat = state.allCategories.find(c => c.id === r.parentCategoryId);
        const sCat = r.subCategoryId ? state.allCategories.find(c => c.id === r.subCategoryId) : null;
        const acc = state.allAccounts.find(a => a.id === r.accountId);

        const isExpense = r.type === 'expense';
        const typeBadge = isExpense
          ? '<span class="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold border border-amber-500/30">支出</span>'
          : '<span class="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">收入</span>';

        const freqLabel = `每月 ${r.dayOfMonth || 1} 號`;
        const catName = pCat ? (sCat ? `${pCat.name} · ${sCat.name}` : pCat.name) : '未指定分類';
        const accName = acc ? acc.name : '未指定帳戶';

        return `
          <div class="p-3 bg-zinc-900 rounded-2xl border border-zinc-800 ${!r.isActive ? 'opacity-60' : ''} space-y-2">
            <div class="flex items-center justify-between pb-1.5 border-b border-zinc-800/80">
              <div class="flex items-center gap-2">
                ${typeBadge}
                <div class="flex items-center gap-1.5">
                  <img src="${pCat?.icon || 'asset/categories-food.svg'}" class="w-4 h-4 object-contain">
                  <span class="text-xs font-bold text-zinc-200">${catName}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm font-mono font-bold ${isExpense ? 'text-amber-400' : 'text-emerald-400'}">NT$ ${r.amount.toLocaleString()}</span>
                <!-- Active Toggle Switch -->
                <button onclick="toggleRecurringActive(${r.id})" class="text-xs px-2 py-0.5 rounded-full ${r.isActive ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-700/60' : 'bg-zinc-800 text-zinc-400'}" title="點擊切換啟用狀態">
                  ${r.isActive ? '啟用中' : '已暫停'}
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-zinc-400 pt-0.5">
              <div class="flex items-center gap-3">
                <span class="flex items-center gap-1">
                  <i data-lucide="wallet" class="w-3.5 h-3.5 text-zinc-500"></i>
                  ${accName}
                </span>
                <span class="flex items-center gap-1 text-zinc-300">
                  <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-400"></i>
                  ${freqLabel}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <button onclick="openRecurringFormModal(${r.id})" class="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-300" title="編輯">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="confirmDeleteRecurring(${r.id})" class="p-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400" title="刪除">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs text-zinc-500 pt-1 border-t border-zinc-800/40">
              <span class="truncate max-w-[200px]">${r.note ? `備註：${r.note}` : '無備註'}</span>
              <span class="font-mono text-zinc-400">下次：${r.nextRunDate || '--'}</span>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    async function toggleRecurringActive(recId) {
      const rec = await db.recurring.get(recId);
      if (!rec) return;

      const newStatus = !rec.isActive;
      await db.recurring.update(recId, { isActive: newStatus });
      showToast(newStatus ? '已啟用排程' : '已暫停排程', 'success');
      await renderRecurringList();
    }

    function switchRecurringFormType(type) {
      state.recurringFormType = type;
      const expBtn = document.getElementById('form-rec-tab-exp');
      const incBtn = document.getElementById('form-rec-tab-inc');

      if (type === 'expense') {
        expBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-amber-500 text-zinc-950';
        incBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
      } else {
        incBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-zinc-950';
        expBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
      }

      populateRecurringCategorySelects();
    }

    function populateRecurringCategorySelects(selectedParentId = null, selectedSubId = null) {
      const pSelect = document.getElementById('form-rec-parent-cat');
      const parents = state.allCategories.filter(
        c => c.type === state.recurringFormType && c.parentId === null && !c.isArchived
      );

      pSelect.innerHTML = parents.map(p => `
        <option value="${p.id}">${p.name}</option>
      `).join('');

      if (selectedParentId && parents.some(p => p.id === selectedParentId)) {
        pSelect.value = selectedParentId;
      } else if (parents.length > 0) {
        pSelect.value = parents[0].id;
      }

      onRecurringParentCatChanged(pSelect.value, selectedSubId);
    }

    function onRecurringParentCatChanged(parentId, targetSubCatId = null) {
      const sSelect = document.getElementById('form-rec-sub-cat');
      const pIdNum = parseInt(parentId, 10);
      const subs = state.allCategories.filter(c => c.parentId === pIdNum && !c.isArchived);

      sSelect.innerHTML = '<option value="">無 (選填)</option>' + subs.map(s => `
        <option value="${s.id}">${s.name}</option>
      `).join('');

      if (targetSubCatId && subs.some(s => s.id === targetSubCatId)) {
        sSelect.value = targetSubCatId;
      } else {
        sSelect.value = '';
      }
    }

    function updateNextRunDateFromFrequency() {
      const dateInput = document.getElementById('form-rec-next-run-date');
      const dayVal = document.getElementById('form-rec-day-of-month')?.value || '1';
      const calculated = calculateInitialNextRunDate(dayVal);
      dateInput.value = calculated;
    }

    async function openRecurringFormModal(recId = null) {
      // 填入 1-31 日期選項
      const domSelect = document.getElementById('form-rec-day-of-month');
      domSelect.innerHTML = Array.from({ length: 31 }, (_, i) => i + 1).map(d => `
        <option value="${d}">${d} 號</option>
      `).join('');

      // 填入帳戶選項
      const accSelect = document.getElementById('form-rec-account');
      const accounts = state.allAccounts.filter(a => !a.isArchived);
      accSelect.innerHTML = accounts.map(a => `
        <option value="${a.id}">${a.name} (${a.groupName})</option>
      `).join('');

      if (recId) {
        const rule = await db.recurring.get(recId);
        if (!rule) return;

        document.getElementById('recurring-form-title').textContent = '編輯固定收支排程';
        document.getElementById('form-rec-id').value = rule.id;
        document.getElementById('form-rec-amount').value = rule.amount;
        document.getElementById('form-rec-note').value = rule.note || '';
        document.getElementById('form-rec-next-run-date').value = rule.nextRunDate || getTodayString();
        accSelect.value = rule.accountId;

        switchRecurringFormType(rule.type);
        populateRecurringCategorySelects(rule.parentCategoryId, rule.subCategoryId);
        domSelect.value = rule.dayOfMonth || 1;
      } else {
        document.getElementById('recurring-form-title').textContent = '新增固定收支排程';
        document.getElementById('form-rec-id').value = '';
        document.getElementById('form-rec-amount').value = '';
        document.getElementById('form-rec-note').value = '';

        switchRecurringFormType('expense');
        domSelect.value = 1;
        updateNextRunDateFromFrequency();
      }

      document.getElementById('recurring-form-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeRecurringFormModal() {
      document.getElementById('recurring-form-modal').classList.add('hidden');
    }

    async function saveRecurringForm() {
      const recIdStr = document.getElementById('form-rec-id').value;
      const amount = parseFloat(document.getElementById('form-rec-amount').value);
      const accId = parseInt(document.getElementById('form-rec-account').value, 10);
      const parentCatId = parseInt(document.getElementById('form-rec-parent-cat').value, 10);
      const subCatVal = document.getElementById('form-rec-sub-cat').value;
      const subCatId = subCatVal ? parseInt(subCatVal, 10) : null;
      const note = document.getElementById('form-rec-note').value.trim();
      const nextRunDate = document.getElementById('form-rec-next-run-date').value;

      if (!amount || amount <= 0) {
        showToast('請輸入大於 0 的金額', 'error');
        return;
      }
      if (!accId) {
        showToast('請選擇帳戶', 'error');
        return;
      }
      if (!parentCatId) {
        showToast('請選擇主分類', 'error');
        return;
      }
      if (!nextRunDate) {
        showToast('請設定下次執行日期', 'error');
        return;
      }

      const dayOfMonth = parseInt(document.getElementById('form-rec-day-of-month').value, 10) || 1;

      const recordData = {
        type: state.recurringFormType,
        amount,
        parentCategoryId: parentCatId,
        subCategoryId: subCatId,
        accountId: accId,
        frequency: 'monthly',
        dayOfMonth,
        dayOfWeek: null,
        nextRunDate,
        note,
        isActive: true
      };

      if (recIdStr) {
        const id = parseInt(recIdStr, 10);
        await db.recurring.update(id, recordData);
        showToast('已成功更新固定收支排程', 'success');
      } else {
        recordData.lastGeneratedDate = null;
        await db.recurring.add(recordData);
        showToast('已成功建立固定收支排程', 'success');
      }

      closeRecurringFormModal();
      await renderRecurringList();
      // 新增或編輯後立即執行一次檢查，若已到期立即補登
      await checkAndApplyRecurring();
      await renderWeekStripCalendar();
      await renderTodayRecords();
    }

    /**
     * =========================================================================
     * 常用支出模板 (Expense Quick Templates)
     * =========================================================================
     */
    async function openTemplateModal() {
      document.getElementById('template-modal').classList.remove('hidden');
      await renderTemplateList();
      lucide.createIcons();
    }

    function closeTemplateModal() {
      document.getElementById('template-modal').classList.add('hidden');
    }

    async function renderTemplateList() {
      const container = document.getElementById('template-list-container');
      const list = await db.templates.toArray();

      if (!list || list.length === 0) {
        container.innerHTML = `
          <div class="py-10 text-center space-y-2">
            <div class="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center mx-auto text-amber-400/60">
              <i data-lucide="zap" class="w-6 h-6"></i>
            </div>
            <div class="text-sm font-bold text-zinc-400">目前尚無常用模板</div>
            <div class="text-xs text-zinc-500">點擊右上角「新增模板」可建立常用支出組合（如：加油、咖啡、午餐）</div>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      container.innerHTML = list.map(t => {
        const pCat = state.allCategories.find(c => c.id === t.parentCategoryId);
        const sCat = t.subCategoryId ? state.allCategories.find(c => c.id === t.subCategoryId) : null;
        const acc = state.allAccounts.find(a => a.id === t.accountId);

        const catName = pCat ? (sCat ? `${pCat.name} · ${sCat.name}` : pCat.name) : '未指定分類';
        const accName = acc ? acc.name : '未指定帳戶';

        return `
          <div class="p-3 bg-zinc-900 hover:bg-zinc-800/70 active:bg-zinc-800 rounded-2xl border border-zinc-800 transition-all cursor-pointer space-y-2 select-none" onclick="applyTemplate(${t.id})">
            <div class="flex items-center justify-between pb-1 border-b border-zinc-800/80">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                  <img src="${pCat?.icon || 'asset/categories-food.svg'}" class="w-4 h-4 object-contain">
                </div>
                <div>
                  <div class="text-sm font-bold text-zinc-100">${t.name}</div>
                  <div class="text-xs text-zinc-400">${catName}</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5" onclick="event.stopPropagation()">
                <button onclick="openTemplateFormModal(${t.id})" class="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400" title="編輯模板">
                  <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="confirmDeleteTemplate(${t.id})" class="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-red-400" title="刪除模板">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </div>

            <div class="flex items-center justify-between text-xs pt-0.5">
              <div class="flex items-center gap-2 text-zinc-400">
                <span class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 border border-zinc-700/60">
                  <i data-lucide="wallet" class="w-3 h-3 text-zinc-400"></i>
                  ${accName}
                </span>
                ${t.note ? `<span class="truncate max-w-[120px] text-zinc-400">備註: ${t.note}</span>` : ''}
              </div>
              <div class="font-mono font-bold text-amber-400">
                ${t.defaultAmount > 0 ? `NT$ ${t.defaultAmount.toLocaleString()}` : '<span class="text-zinc-500 text-xs font-normal">每次輸入金額</span>'}
              </div>
            </div>
          </div>
        `;
      }).join('');

      lucide.createIcons();
    }

    async function applyTemplate(templateId) {
      const t = await db.templates.get(templateId);
      if (!t) return;

      closeTemplateModal();

      // 1. 切換為支出模式
      switchType('expense');

      // 2. 套用主分類
      const pCat = state.allCategories.find(c => c.id === t.parentCategoryId && !c.isArchived);
      if (pCat) {
        setSelectedParentCategory(pCat);
      }

      // 3. 套用子分類
      const sCat = t.subCategoryId ? state.allCategories.find(c => c.id === t.subCategoryId && !c.isArchived) : null;
      setSelectedSubCategory(sCat);

      // 4. 套用帳戶
      const acc = state.allAccounts.find(a => a.id === t.accountId && !a.isArchived);
      if (acc) {
        setSelectedAccount(acc);
      }

      // 5. 帶入備註
      document.getElementById('input-note').value = t.note || '';

      // 6. 帶入金額與鍵盤處理
      if (t.defaultAmount && t.defaultAmount > 0) {
        state.calcExpression = String(t.defaultAmount);
        document.getElementById('card-display-amount').textContent = state.calcExpression;
        showToast(`已套用模板「${t.name}」 (NT$ ${t.defaultAmount})`, 'success');
      } else {
        state.calcExpression = '0';
        document.getElementById('card-display-amount').textContent = state.calcExpression;
        // 若未預設金額，自動開啟計算機鍵盤讓使用者輸入
        openCalculatorSheet();
        showToast(`已套用模板「${t.name}」，請輸入金額`, 'info');
      }
    }

    function onTemplateParentCatChanged(parentId, targetSubCatId = null) {
      const sSelect = document.getElementById('form-tpl-sub-cat');
      const pIdNum = parseInt(parentId, 10);
      const subs = state.allCategories.filter(c => c.parentId === pIdNum && !c.isArchived);

      sSelect.innerHTML = '<option value="">無 (選填)</option>' + subs.map(s => `
        <option value="${s.id}">${s.name}</option>
      `).join('');

      if (targetSubCatId && subs.some(s => s.id === targetSubCatId)) {
        sSelect.value = targetSubCatId;
      } else {
        sSelect.value = '';
      }
    }

    async function openTemplateFormModal(templateId = null) {
      // 帳戶選單
      const accSelect = document.getElementById('form-tpl-account');
      const accounts = state.allAccounts.filter(a => !a.isArchived);
      accSelect.innerHTML = accounts.map(a => `
        <option value="${a.id}">${a.name} (${a.groupName})</option>
      `).join('');

      // 主分類選單（支出）
      const pSelect = document.getElementById('form-tpl-parent-cat');
      const parents = state.allCategories.filter(
        c => c.type === 'expense' && c.parentId === null && !c.isArchived
      );
      pSelect.innerHTML = parents.map(p => `
        <option value="${p.id}">${p.name}</option>
      `).join('');

      if (templateId) {
        const t = await db.templates.get(templateId);
        if (!t) return;

        document.getElementById('template-form-title').textContent = '編輯支出模板';
        document.getElementById('form-tpl-id').value = t.id;
        document.getElementById('form-tpl-name').value = t.name;
        document.getElementById('form-tpl-amount').value = t.defaultAmount > 0 ? t.defaultAmount : '';
        document.getElementById('form-tpl-note').value = t.note || '';

        accSelect.value = t.accountId;
        pSelect.value = t.parentCategoryId;
        onTemplateParentCatChanged(t.parentCategoryId, t.subCategoryId);
      } else {
        document.getElementById('template-form-title').textContent = '新增支出模板';
        document.getElementById('form-tpl-id').value = '';
        document.getElementById('form-tpl-name').value = '';
        document.getElementById('form-tpl-amount').value = '';
        document.getElementById('form-tpl-note').value = '';

        if (state.selectedAccount) {
          accSelect.value = state.selectedAccount.id;
        }
        if (parents.length > 0) {
          pSelect.value = parents[0].id;
          onTemplateParentCatChanged(parents[0].id);
        }
      }

      document.getElementById('template-form-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeTemplateFormModal() {
      document.getElementById('template-form-modal').classList.add('hidden');
    }

    async function saveTemplateForm() {
      const tplIdStr = document.getElementById('form-tpl-id').value;
      const name = document.getElementById('form-tpl-name').value.trim();
      const accId = parseInt(document.getElementById('form-tpl-account').value, 10);
      const parentCatId = parseInt(document.getElementById('form-tpl-parent-cat').value, 10);
      const subCatVal = document.getElementById('form-tpl-sub-cat').value;
      const subCatId = subCatVal ? parseInt(subCatVal, 10) : null;
      const defaultAmount = Math.max(0, parseFloat(document.getElementById('form-tpl-amount').value) || 0);
      const note = document.getElementById('form-tpl-note').value.trim();

      if (!name) {
        showToast('請輸入模板名稱', 'error');
        return;
      }
      if (!accId) {
        showToast('請選擇付款帳戶', 'error');
        return;
      }
      if (!parentCatId) {
        showToast('請選擇支出主分類', 'error');
        return;
      }

      const templateData = {
        name,
        type: 'expense',
        accountId: accId,
        parentCategoryId: parentCatId,
        subCategoryId: subCatId,
        defaultAmount,
        note
      };

      if (tplIdStr) {
        const id = parseInt(tplIdStr, 10);
        await db.templates.update(id, templateData);
        showToast(`已成功修改模板「${name}」`, 'success');
      } else {
        await db.templates.add(templateData);
        showToast(`已成功建立模板「${name}」`, 'success');
      }

      closeTemplateFormModal();
      await renderTemplateList();
    }

    /**
     * 強制檢查更新與清除舊快取
     */
    async function forceUpdateApp() {
      showToast('正在清除快取並檢查最新版本...', 'info');
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          for (const reg of regs) {
            await reg.unregister();
          }
        }
        setTimeout(() => {
          window.location.reload(true);
        }, 600);
      } catch (err) {
        window.location.reload(true);
      }
    }

    /**
     * Toast System
     */
    function showToast(message, type = 'info') {
      const container = document.getElementById('toast-container');
      const toast = document.createElement('div');
      
      const iconName = type === 'error' ? 'alert-circle' : (type === 'success' ? 'check-circle-2' : 'info');
      const borderClass = type === 'error' ? 'border-red-500/50 bg-red-950/90 text-red-200' : (type === 'success' ? 'border-emerald-500/50 bg-zinc-900/95 text-emerald-300' : 'border-zinc-700 bg-zinc-800 text-zinc-200');

      toast.className = `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium border shadow-2xl backdrop-blur-md transition-all duration-300 transform translate-y-[-10px] opacity-0 ${borderClass}`;
      toast.innerHTML = `
        <i data-lucide="${iconName}" class="w-4 h-4 flex-shrink-0"></i>
        <span>${message}</span>
      `;

      container.appendChild(toast);
      lucide.createIcons();

      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-[-10px]', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
      });

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
      }, 2200);
    }

    window.addEventListener('DOMContentLoaded', initApp);
