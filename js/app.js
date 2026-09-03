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
      editRecordType: 'expense'
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
        await loadAllData();
        setupDefaultSelections();
        renderWeekStripCalendar();
        renderSubCategoryQuickPills();
        await renderTodayRecords();
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
     * Week Strip Calendar Rendering
     */
    async function renderWeekStripCalendar() {
      const container = document.getElementById('week-strip-container');
      const titleEl = document.getElementById('calendar-header-title');
      const pickerInput = document.getElementById('input-date-picker');
      const todayStr = getTodayString();

      pickerInput.value = state.selectedDate;
      pickerInput.max = todayStr;

      const selectedD = new Date(state.selectedDate + 'T00:00:00');
      titleEl.textContent = `${selectedD.getFullYear()}年 ${selectedD.getMonth() + 1}月`;

      const listLabel = document.getElementById('list-date-label');
      if (state.selectedDate === todayStr) {
        listLabel.textContent = '本日明細';
      } else {
        listLabel.textContent = `${selectedD.getMonth() + 1}月${selectedD.getDate()}日 明細`;
      }

      const weekDays = getWeekDaysForDate(state.selectedDate);
      const startOfWeek = weekDays[0].dateStr;
      const endOfWeek = weekDays[6].dateStr;
      const weekRecords = await db.records.where('date').between(startOfWeek, endOfWeek, true, true).toArray();
      const recordDatesSet = new Set(weekRecords.map(r => r.date));

      container.innerHTML = weekDays.map(item => {
        const isSelected = item.dateStr === state.selectedDate;
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

    async function onDatePickerChanged(val) {
      if (!val) return;
      const today = getTodayString();
      if (val > today) {
        showToast('不允許選擇未來日期', 'error');
        document.getElementById('input-date-picker').value = state.selectedDate;
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
                  <div class="flex items-center gap-1.5 text-sm font-bold text-zinc-200">
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
                  <div class="text-[10px] font-mono font-bold text-blue-400">
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
                  <span class="text-sm font-bold text-zinc-200 truncate">${catTitle}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 flex-shrink-0">${acc?.name || '未知'}</span>
                </div>
                ${rec.note ? `<div class="text-xs text-zinc-400 truncate mt-0.5">${rec.note}</div>` : ''}
              </div>
            </div>

            <div class="flex items-center gap-1 flex-shrink-0">
              <div class="text-right mr-1">
                <div class="text-[10px] font-mono font-bold ${amountColor}">
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
            <div class="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">${grp}</div>
            <div class="space-y-2">
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
                  <div class="flex items-center justify-between p-3 rounded-2xl bg-zinc-900 border border-zinc-800/80 ${acc.isArchived ? 'opacity-50' : ''}">
                    <div class="flex items-center gap-2.5 min-w-0 flex-1">
                      <img src="${acc.icon}" class="w-5 h-5 object-contain flex-shrink-0">
                      <div class="min-w-0 flex-1">
                        <div class="text-sm font-bold text-zinc-200 flex items-center gap-1.5 truncate">
                          <span>${acc.name}</span>
                          ${acc.isDefault ? '<span class="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded">預設</span>' : ''}
                          ${acc.isArchived ? '<span class="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">已封存</span>' : ''}
                        </div>
                        <div class="text-xs text-zinc-400 font-mono mt-0.5">
                          初始: NT$ ${(acc.initialBalance || 0).toLocaleString()} ｜ 當前餘額: <span class="font-bold text-zinc-200">NT$ ${bal.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      <button onclick="openEditAccountForm(${acc.id})" class="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 flex items-center gap-1 font-semibold">
                        <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
                        <span>編輯</span>
                      </button>
                      <button onclick="toggleArchiveAccount(${acc.id})" class="text-xs px-2.5 py-1 rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600">
                        ${acc.isArchived ? '解封' : '封存'}
                      </button>
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
        expTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-amber-500 text-zinc-950';
        incTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
      } else {
        incTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-emerald-500 text-zinc-950';
        expTab.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
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
            <div class="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div class="flex items-center gap-2">
                <img src="${p.icon}" class="w-5 h-5 object-contain">
                <span class="text-xs font-bold text-zinc-200">${p.name}</span>
                ${p.isArchived ? '<span class="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">已封存</span>' : ''}
              </div>
              <div class="flex items-center gap-1.5">
                <button onclick="openEditCategoryForm(${p.id})" class="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-semibold">
                  編輯
                </button>
                <button onclick="openNewCategoryForm(${p.id})" class="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-bold hover:bg-amber-500/30">
                  + 子分類
                </button>
                <button onclick="toggleArchiveCategory(${p.id})" class="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700">
                  ${p.isArchived ? '解封' : '封存'}
                </button>
              </div>
            </div>

            <div class="pt-2 flex flex-wrap gap-1.5">
              ${subs.length > 0 ? subs.map(s => `
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 border border-zinc-700/60 text-xs text-zinc-300 ${s.isArchived ? 'opacity-50' : ''}">
                  <img src="${s.icon}" class="w-3.5 h-3.5 object-contain">
                  <span>${s.name}</span>
                  <button onclick="openEditCategoryForm(${s.id})" title="編輯" class="text-zinc-400 hover:text-amber-300 ml-0.5">
                    <i data-lucide="edit-3" class="w-3 h-3"></i>
                  </button>
                  <button onclick="toggleArchiveCategory(${s.id})" title="${s.isArchived ? '解封' : '封存'}" class="text-zinc-500 hover:text-red-400 ml-0.5">
                    <i data-lucide="${s.isArchived ? 'rotate-ccw' : 'x'}" class="w-3 h-3"></i>
                  </button>
                </div>
              `).join('') : '<span class="text-xs text-zinc-500">尚無子分類</span>'}
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

      if (level === 'parent') {
        pBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-amber-500 text-zinc-950';
        sBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
        parentSelectWrap.classList.add('hidden');
      } else {
        sBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold bg-amber-500 text-zinc-950';
        pBtn.className = 'flex-1 py-1 rounded-lg text-xs font-bold text-zinc-400';
        parentSelectWrap.classList.remove('hidden');
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
        await db.categories.update(catId, {
          name,
          parentId,
          icon
        });
        showToast(`已成功修改分類「${name}」`, 'success');
      } else {
        await db.categories.add({
          name,
          type: state.categoryManageType,
          parentId: parentId,
          icon: icon,
          color: '#f59e0b',
          budgetMonthly: 0,
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

    function closeConfirmModal() {
      pendingDeleteId = null;
      document.getElementById('confirm-modal').classList.add('hidden');
    }

    /**
     * Reports Modal & Chart.js Integration
     */
    async function openReportsModal() {
      const allRecords = await db.records.toArray();
      const now = new Date();
      const curYearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      let monthExp = 0;
      let monthInc = 0;
      const catExpenseMap = {};

      for (const rec of allRecords) {
        if (rec.date && rec.date.startsWith(curYearMonth)) {
          if (rec.type === 'expense') {
            monthExp += rec.amount;
            const parentCat = state.allCategories.find(c => c.id === rec.parentCategoryId);
            const name = parentCat?.name || '其他';
            catExpenseMap[name] = (catExpenseMap[name] || 0) + rec.amount;
          } else if (rec.type === 'income') {
            monthInc += rec.amount;
          }
        }
      }

      document.getElementById('stat-month-expense').textContent = `NT$ ${monthExp.toLocaleString()}`;
      document.getElementById('stat-month-income').textContent = `NT$ ${monthInc.toLocaleString()}`;
      document.getElementById('stat-month-balance').textContent = `NT$ ${(monthInc - monthExp).toLocaleString()}`;

      const ctx = document.getElementById('categoryExpenseChart').getContext('2d');
      if (state.chartInstance) state.chartInstance.destroy();

      const labels = Object.keys(catExpenseMap);
      const data = Object.values(catExpenseMap);

      if (labels.length === 0) {
        labels.push('尚無支出');
        data.push(1);
      }

      state.chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308']
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#a1a1aa', font: { size: 10 } } }
          }
        }
      });

      document.getElementById('reports-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeReportsModal() {
      document.getElementById('reports-modal').classList.add('hidden');
    }

    /**
     * Backup & Export Modal
     */
    function openBackupModal() {
      document.getElementById('backup-modal').classList.remove('hidden');
      lucide.createIcons();
    }

    function closeBackupModal() {
      document.getElementById('backup-modal').classList.add('hidden');
    }

    async function exportJSONBackup() {
      const data = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        categories: await db.categories.toArray(),
        accounts: await db.accounts.toArray(),
        records: await db.records.toArray(),
        recurring: await db.recurring.toArray()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PocketLedger_Backup_${getTodayString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('備份檔案已成功下載', 'success');
    }

    async function importJSONBackup(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const json = JSON.parse(e.target.result);
          if (!json.categories || !json.accounts || !json.records) {
            showToast('備份檔案格式不正確', 'error');
            return;
          }

          await db.transaction('rw', db.categories, db.accounts, db.records, db.recurring, async () => {
            await db.categories.clear();
            await db.accounts.clear();
            await db.records.clear();
            await db.recurring.clear();

            await db.categories.bulkAdd(json.categories);
            await db.accounts.bulkAdd(json.accounts);
            await db.records.bulkAdd(json.records);
            if (json.recurring) await db.recurring.bulkAdd(json.recurring);
          });

          await loadAllData();
          await renderWeekStripCalendar();
          renderSubCategoryQuickPills();
          await renderTodayRecords();
          showToast('資料庫已成功還原！', 'success');
          closeBackupModal();
        } catch (err) {
          console.error(err);
          showToast('匯入失敗，檔案損壞', 'error');
        }
      };
      reader.readAsText(file);
    }

    function switchView(view) {
      // Home view handler
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

    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.log('SW registration error:', err);
        });
      });
    }

    window.addEventListener('DOMContentLoaded', initApp);
