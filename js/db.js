/**
     * 1. Dexie.js Schema & Database Initialization
     */
    const db = new Dexie('PocketLedgerDB');
    db.version(1).stores({
      accounts: '++id, name, groupName, isDefault, isArchived',
      categories: '++id, type, parentId, isArchived',
      records: '++id, type, date, parentCategoryId, subCategoryId, accountId, targetAccountId, recurringId, createdAt',
      recurring: '++id, type, accountId, parentCategoryId, subCategoryId, frequency, nextRunDate, isActive'
    });
    db.version(2).stores({
      templates: '++id, name, type, accountId, parentCategoryId, subCategoryId'
    });

    const AVAILABLE_ICONS = [
      'asset/categories-food.svg',
      'asset/categories-coffee.svg',
      'asset/categories-chocolate.svg',
      'asset/categories-wine.svg',
      'asset/categories-fork-and-knife-with-plate.svg',
      'asset/categories-house.svg',
      'asset/categories-traffic.svg',
      'asset/categories-motorcycle.svg',
      'asset/categories-car.svg',
      'asset/categories-camera.svg',
      'asset/categories-computer.svg',
      'asset/categories-mobilephone.svg',
      'asset/categories-wifi.svg',
      'asset/categories-palmtree.svg',
      'asset/categories-mansshirt.svg',
      'asset/categories-barber.svg',
      'asset/categories-joystick.svg',
      'asset/categories-bookmark.svg',
      'asset/categories-books.svg',
      'asset/categories-cash.svg',
      'asset/categories-family.svg',
      'asset/categories-redenvelope.svg',
      'asset/categories-hospital.svg',
      'asset/categories-pills.svg',
      'asset/categories-massage.svg',
      'asset/categories-money.svg',
      'asset/categories-worker.svg',
      'asset/categories-coin.svg',
      'asset/categories-increasing.svg',
      'asset/account-dollar.svg',
      'asset/account-bank.svg',
      'asset/account-creditcard.svg'
    ];

    const SEED_DATA = {
      categories: [
        {
          name: '食物酒水', type: 'expense', icon: 'asset/categories-food.svg', color: '#f97316', budgetMonthly: 0,
          children: [
            { name: '早餐', icon: 'asset/categories-food.svg' },
            { name: '中餐', icon: 'asset/categories-food.svg' },
            { name: '晚餐', icon: 'asset/categories-food.svg' },
            { name: '消夜', icon: 'asset/categories-food.svg' },
            { name: '茶、飲料', icon: 'asset/categories-coffee.svg' },
            { name: '水果、零食', icon: 'asset/categories-chocolate.svg' },
            { name: '酒', icon: 'asset/categories-wine.svg' },
            { name: '外食', icon: 'asset/categories-fork-and-knife-with-plate.svg' }
          ]
        },
        {
          name: '居家物業', type: 'expense', icon: 'asset/categories-house.svg', color: '#3b82f6', budgetMonthly: 0,
          children: [
            { name: '房租', icon: 'asset/categories-house.svg' },
            { name: '水費', icon: 'asset/categories-house.svg' },
            { name: '電費', icon: 'asset/categories-house.svg' },
            { name: '瓦斯費', icon: 'asset/categories-house.svg' },
            { name: '日常用品', icon: 'asset/categories-house.svg' }
          ]
        },
        {
          name: '行車交通', type: 'expense', icon: 'asset/categories-traffic.svg', color: '#06b6d4', budgetMonthly: 0,
          children: [
            { name: '機車油資', icon: 'asset/categories-motorcycle.svg' },
            { name: '機車停車費', icon: 'asset/categories-motorcycle.svg' },
            { name: '機車稅/險', icon: 'asset/categories-motorcycle.svg' },
            { name: '機車保養/維修', icon: 'asset/categories-motorcycle.svg' },
            { name: '汽車油資', icon: 'asset/categories-car.svg' },
            { name: '汽車停車費', icon: 'asset/categories-car.svg' },
            { name: '汽車稅/險', icon: 'asset/categories-car.svg' },
            { name: '汽車保養/維修', icon: 'asset/categories-car.svg' },
            { name: 'ETC', icon: 'asset/categories-car.svg' },
            { name: '罰單', icon: 'asset/categories-camera.svg' },
            { name: '其他交通費', icon: 'asset/categories-traffic.svg' }
          ]
        },
        {
          name: '3C通訊', type: 'expense', icon: 'asset/categories-computer.svg', color: '#8b5cf6', budgetMonthly: 0,
          children: [
            { name: '手機費', icon: 'asset/categories-mobilephone.svg' },
            { name: '網路費', icon: 'asset/categories-wifi.svg' },
            { name: '3C配件', icon: 'asset/categories-computer.svg' }
          ]
        },
        {
          name: '休閒娛樂', type: 'expense', icon: 'asset/categories-palmtree.svg', color: '#ec4899', budgetMonthly: 0,
          children: [
            { name: '旅遊', icon: 'asset/categories-palmtree.svg' },
            { name: '治裝費', icon: 'asset/categories-mansshirt.svg' },
            { name: '儀容整理', icon: 'asset/categories-barber.svg' },
            { name: '休閒玩樂', icon: 'asset/categories-joystick.svg' }
          ]
        },
        {
          name: '進修學習', type: 'expense', icon: 'asset/categories-bookmark.svg', color: '#10b981', budgetMonthly: 0,
          children: [
            { name: '書籍', icon: 'asset/categories-books.svg' },
            { name: '課程', icon: 'asset/categories-bookmark.svg' },
            { name: '資訊訂閱', icon: 'asset/categories-books.svg' }
          ]
        },
        {
          name: '人情往來', type: 'expense', icon: 'asset/categories-cash.svg', color: '#eab308', budgetMonthly: 0,
          children: [
            { name: '請客送禮', icon: 'asset/categories-cash.svg' },
            { name: '孝親', icon: 'asset/categories-family.svg' },
            { name: '捐款', icon: 'asset/categories-cash.svg' },
            { name: '婚喪喜慶', icon: 'asset/categories-redenvelope.svg' }
          ]
        },
        {
          name: '保健醫療', type: 'expense', icon: 'asset/categories-hospital.svg', color: '#ef4444', budgetMonthly: 0,
          children: [
            { name: '生病醫療', icon: 'asset/categories-hospital.svg' },
            { name: '健康食品', icon: 'asset/categories-pills.svg' },
            { name: '藥品', icon: 'asset/categories-pills.svg' },
            { name: '肌肉整復', icon: 'asset/categories-massage.svg' }
          ]
        },
        {
          name: '日常收入', type: 'income', icon: 'asset/categories-money.svg', color: '#10b981', budgetMonthly: 0,
          children: [
            { name: '工作收入', icon: 'asset/categories-worker.svg' },
            { name: '利息收入', icon: 'asset/categories-coin.svg' },
            { name: '投資收入', icon: 'asset/categories-increasing.svg' },
            { name: '課程收入', icon: 'asset/categories-bookmark.svg' },
            { name: '其他收入', icon: 'asset/categories-money.svg' }
          ]
        }
      ],
      accounts: [
        { groupName: '現金', name: '現金', icon: 'asset/account-dollar.svg', initialBalance: 0, isDefault: true, isArchived: false },
        { groupName: '銀行', name: '中國信託', icon: 'asset/account-bank.svg', initialBalance: 0, isDefault: false, isArchived: false },
        { groupName: '銀行', name: '華南-薪轉', icon: 'asset/account-bank.svg', initialBalance: 0, isDefault: false, isArchived: false },
        { groupName: '銀行', name: '華南-數位', icon: 'asset/account-bank.svg', initialBalance: 0, isDefault: false, isArchived: false },
        { groupName: '信用卡', name: '中信卡', icon: 'asset/account-creditcard.svg', initialBalance: 0, isDefault: false, isArchived: false },
        { groupName: '信用卡', name: '華南卡', icon: 'asset/account-creditcard.svg', initialBalance: 0, isDefault: false, isArchived: false },
        { groupName: '信用卡', name: '玉山卡', icon: 'asset/account-creditcard.svg', initialBalance: 0, isDefault: false, isArchived: false }
      ]
    };


    async function initDatabaseSeeds() {
      const catCount = await db.categories.count();
      if (catCount === 0) {
        for (const cat of SEED_DATA.categories) {
          const parentId = await db.categories.add({
            name: cat.name,
            type: cat.type,
            parentId: null,
            icon: cat.icon,
            color: cat.color || '#f59e0b',
            budgetMonthly: 0,
            isArchived: false
          });

          if (cat.children && cat.children.length > 0) {
            for (const child of cat.children) {
              await db.categories.add({
                name: child.name,
                type: cat.type,
                parentId: parentId,
                icon: child.icon,
                color: cat.color || '#f59e0b',
                budgetMonthly: 0,
                isArchived: false
              });
            }
          }
        }
      }

      const accCount = await db.accounts.count();
      if (accCount === 0) {
        for (const acc of SEED_DATA.accounts) {
          await db.accounts.add({
            name: acc.name,
            groupName: acc.groupName,
            icon: acc.icon,
            initialBalance: acc.initialBalance || 0,
            isDefault: !!acc.isDefault,
            isArchived: false
          });
        }
      }
    }
