"use client";

import { useEffect, useState } from "react";

export default function SecurityProvider({ children }: { children: React.ReactNode }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // 2، 4 و 6: مسدود کردن کلیدهای میانبر (استفاده از e.code برای پشتیبانی از تمام زبان‌های کیبورد)
    const handleKeyDown = (e: KeyboardEvent) => {
      // مسدود کردن F12
      if (e.code === "F12") { e.preventDefault(); return false; }
      
      // مسدود کردن Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C (Developer Tools)
      if (e.ctrlKey && e.shiftKey && ["KeyI", "KeyJ", "KeyC"].includes(e.code)) { 
        e.preventDefault(); 
        return false; 
      }

      // مسدود کردن Ctrl+U (View Source) و Ctrl+S (Save Page)
      if (e.ctrlKey && ["KeyU", "KeyS"].includes(e.code)) { 
        e.preventDefault(); 
        return false; 
      }
    };

    // 5: جلوگیری از کشیدن (Drag) عکس‌ها
    const handleDragStart = (e: DragEvent) => {
      if (e.target instanceof HTMLImageElement) {
        e.preventDefault();
      }
    };

    // 1: ساخت منوی کلیک راست سفارشی به جای بستن کامل آن
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // جلوگیری از باز شدن منوی پیش‌فرض مرورگر (که شامل Inspect است)
      
      // محاسبه موقعیت برای اینکه منو از صفحه بیرون نزند
      const menuWidth = 160;
      const menuHeight = 220;
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 10;
      if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 10;

      setMenuPos({ x, y });
      setMenuVisible(true);
    };

    // بستن منوی سفارشی با کلیک چپ یا کلیک در جای دیگر
    const handleCloseMenu = () => setMenuVisible(false);

    // 3: تشخیص باز بودن Developer Tools
    // const detectDevTools = () => {
    //   const threshold = 160;
    //   const widthDiff = window.outerWidth - window.innerWidth;
    //   const heightDiff = window.outerHeight - window.innerHeight;

    //   if (widthDiff > threshold || heightDiff > threshold) {
    //     document.body.innerHTML = `
    //       <div style="display:flex;align-items:center;justify-content:center;height:100vh;width:100vw;background:#1a1a1a;color:#ff4d4d;font-family:sans-serif;text-align:center;padding:20px;box-sizing:border-box;">
    //         <div>
    //           <h1 style="font-size:24px;margin-bottom:10px;">دسترسی غیرمجاز</h1>
    //           <p style="font-size:16px;">برای حفظ امنیت سایت، استفاده از ابزارهای توسعه‌دهنده مسدود شده است.</p>
    //         </div>
    //       </div>
    //     `;
    //   }
    // };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("dragstart", handleDragStart);
    document.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleCloseMenu);
    
    // const devToolsInterval = setInterval(detectDevTools, 500);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("dragstart", handleDragStart);
      document.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("click", handleCloseMenu);
      clearInterval(devToolsInterval);
    };
  }, []);

  // توابع مربوط به دکمه‌های منوی سفارشی
  const handleAction = (action: string) => {
    switch (action) {
      case 'back':
        window.history.back();
        break;
      case 'forward':
        window.history.forward();
        break;
      case 'reload':
        window.location.reload();
        break;
      case 'copy':
        document.execCommand('copy');
        break;
      case 'selectAll':
        document.execCommand('selectAll');
        break;
      case 'print':
        window.print();
        break;
    }
    setMenuVisible(false);
  };

  return (
    <>
      {children}
      
      {/* منوی کلیک راست سفارشی */}
      {menuVisible && (
        <div
          style={{ top: `${menuPos.y}px`, left: `${menuPos.x}px` }}
          className="fixed z-[99999] min-w-[160px] bg-white shadow-xl rounded-lg border border-gray-200 py-2 font-medium text-sm text-slate-700 select-none"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => handleAction('back')} className="w-full text-right px-4 py-2 hover:bg-[#F5FAFF] hover:text-[#2993A3] transition-colors flex items-center gap-2">
            <span>↶</span> بازگشت
          </button>
          <button onClick={() => handleAction('forward')} className="w-full text-right px-4 py-2 hover:bg-[#F5FAFF] hover:text-[#2993A3] transition-colors flex items-center gap-2">
            <span>↷</span> جلو
          </button>
          <button onClick={() => handleAction('reload')} className="w-full text-right px-4 py-2 hover:bg-[#F5FAFF] hover:text-[#2993A3] transition-colors flex items-center gap-2">
            <span>⟳</span> بازخوانی صفحه
          </button>
          <div className="my-1 border-t border-gray-100"></div>
          <button onClick={() => handleAction('copy')} className="w-full text-right px-4 py-2 hover:bg-[#F5FAFF] hover:text-[#2993A3] transition-colors flex items-center gap-2">
            <span>⧉</span> کپی
          </button>
          <button onClick={() => handleAction('selectAll')} className="w-full text-right px-4 py-2 hover:bg-[#F5FAFF] hover:text-[#2993A3] transition-colors flex items-center gap-2">
            <span>🗹</span> انتخاب همه
          </button>
          <div className="my-1 border-t border-gray-100"></div>
          <button onClick={() => handleAction('print')} className="w-full text-right px-4 py-2 hover:bg-[#F5FAFF] hover:text-[#2993A3] transition-colors flex items-center gap-2">
            <span>🖨</span> چاپ صفحه
          </button>
        </div>
      )}
    </>
  );
}