"use client";

import { useState, useEffect, useCallback } from "react";
import { getUsersList, deactivateUserApi, User } from "@/lib/users";
import UserRow from "@/components/admin/users/user-row";
import DeactivateUserModal from "@/components/admin/users/deactivate-user-modal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UsersListPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Search States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Sort States
  const [sortBy, setSortBy] = useState("date_joined");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  
  // Modals State
  const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null);

  // Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const orderingParam = `${order === "desc" ? "-" : ""}${sortBy}`;
      const data = await getUsersList({
        search: debouncedSearch,
        ordering: orderingParam,
      });
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, sortBy, order]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Actions
  const handleDeactivate = async (reason: string) => {
    if (!deactivateTarget) return;
    const targetId = deactivateTarget.id;
    const prevUsers = users;
    
    // Optimistic UI
    setUsers(prev => prev.filter(u => u.id !== deactivateTarget.id));
    setDeactivateTarget(null);
    
    try {
      await deactivateUserApi(targetId, reason);
    } catch (err) {
      setUsers(prevUsers); // Revert on failure
      console.error(err);
    }
  };

  const OrderIcon = order === "desc" ? ArrowDown : ArrowUp;

  return (
    // 1. تغییر p-8 به p-4 md:p-8 و اضافه کردن min-h-full
    <div className="w-full min-h-full flex flex-col space-y-6 bg-white rounded-2xl p-4 md:p-8">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800">لیست کاربران</h1>

      {/* 2. استفاده از grid برای چیدمان موبایل */}
      <div className="bg-white p-4 rounded-xl border border-gray-100 grid grid-cols-1 md:flex md:flex-row gap-4 md:items-center">
        {/* Search */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="جستجوی نام کاربری..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 bg-gray-50 border-gray-200 w-full"
          />
        </div>

        {/* Sort & Order Wrapper */}
        {/* 3. اصلاح عرض و فلکس باکس برای موبایل */}
        <div className="flex flex-col md:flex-row md:items-center gap-2 p-1 border rounded-lg w-full md:w-auto border-gray-200">
          <span className="text-xs text-gray-500 px-2 whitespace-nowrap">مرتب سازی:</span>
          <div className="flex gap-2 w-full">
            <Select value={sortBy} onValueChange={setSortBy}>
              {/* 4. اصلاح کلاس‌های نامعتبر تایپوگرافی (w-45 حذف و flex-1 اضافه شد) */}
              <SelectTrigger className="flex-1 text-xs border-none bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem className="text-xs" value="date_joined">تاریخ ساخت حساب</SelectItem>
                <SelectItem className="text-xs" value="first_name">نام</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={order} onValueChange={(v) => setOrder(v as "asc" | "desc")}>
              {/* اصلاح w-25 نامعتبر به w-[90px] */}
              <SelectTrigger className="w-[90px] border-none bg-transparent focus:ring-0 text-xs">
                <div className="flex items-center gap-1">
                  <OrderIcon className="h-4 w-4 text-[#2993A3]" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem className="text-xs" value="desc">نزولی</SelectItem>
                <SelectItem className="text-xs" value="asc">صعودی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {isLoading ? (
          <p className="text-center text-gray-400 py-8">در حال بارگذاری...</p>
        ) : users.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
            <p className="text-gray-400">کاربری یافت نشد.</p>
          </div>
        ) : (
          users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onDeactivate={(u) => setDeactivateTarget(u)}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <DeactivateUserModal
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        userName={deactivateTarget ? `${deactivateTarget.first_name} ${deactivateTarget.last_name}` : ""}
      />
    </div>
  );
}