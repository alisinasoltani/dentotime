// utils/mockApi.ts

const ALL_HOURS = ['08', '09', '10', '11', '12', '13', '14', '15', '16'];

// وضعیت فرضی دیتابیس
const serverState = {
  // تعطیلات رسمی یا روزهایی که ادمین بسته است (مثال: ۱۰، ۱۹ و ۲۵ خرداد)
  offDays: ['1405-03-10', '1405-03-19', '1405-03-25'], 
  
  // رزروهای انجام شده به فرمت { 'YYYY-MM-DD': ['HH', 'HH'] }
  reservations: {
    '1405-03-24': ['10', '11', '14'], 
    '1405-03-26': ['08', '09', '10', '11', '12', '13', '14', '15', '16'], // یک روز کاملا پر شده
  } as Record<string, string[]>
};

export const api = {
  // دریافت اطلاعات ماه (تعطیلات و روزهای کاملا پر)
  fetchMonthData: async () => {
    await new Promise(resolve => setTimeout(resolve, 300)); // شبیه‌سازی تاخیر شبکه
    
    // پیدا کردن روزهایی که تمام ساعاتشان رزرو شده است
    const fullyBookedDays = Object.keys(serverState.reservations).filter(
      date => serverState.reservations[date].length === ALL_HOURS.length
    );

    return {
      offDays: serverState.offDays,
      fullyBookedDays
    };
  },

  // دریافت ساعات آزاد برای یک روز خاص
  getAvailableHours: async (dateStr: string) => {
    await new Promise(resolve => setTimeout(resolve, 200));
    const bookedHours = serverState.reservations[dateStr] || [];
    return ALL_HOURS.filter(hour => !bookedHours.includes(hour));
  },

  // ثبت نوبت
  submitBooking: async (data: any) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    const { date, time } = data;
    
    if (!serverState.reservations[date]) {
      serverState.reservations[date] = [];
    }
    
    if (serverState.reservations[date].includes(time)) {
      throw new Error("متاسفانه این ساعت به تازگی رزرو شد.");
    }

    // اضافه کردن ساعت به لیست رزروهای آن روز
    serverState.reservations[date].push(time);
    console.log("✅ [Mock Server] Booking Saved:", JSON.stringify(data, null, 2));
    
    return { success: true };
  }
};