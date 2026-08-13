"use client";

import { useState, useEffect } from "react";
import api from "@/lib/api";
import { Users, Stethoscope, MessageSquare, FileCheck, CalendarDays, Loader2, CheckCircle, Hourglass } from "lucide-react";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState({
    users: 0,
    doctorsApproved: 0,
    doctorsPending: 0,
    unreadMessages: 0,
    recentVerifications: 0,
    recentAppointments: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // محاسبه زمان ۷ روز پیش
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // دریافت همزمان تمام آمارها برای سرعت بالا
        const [usersRes, docsApprovedRes, docsPendingRes, threadsRes, apptsRes] = await Promise.all([
          api.get('/admin/users/', { params: { page_size: 1 } }),
          api.get('/admin/doctors/', { params: { verification_status: 'APPROVED', page_size: 1 } }),
          api.get('/admin/doctors/', { params: { verification_status: 'PENDING', page_size: 100 } }),
          api.get('/chat/threads/', { params: { page_size: 100 } }),
          api.get('/admin/appointments/', { params: { page_size: 100 } }),
        ]);

        // فیلتر کردن درخواست‌های احراز هویت در ۷ روز گذشته
        const recentVerifs = (docsPendingRes.data.results || []).filter((d: any) => 
          d.submitted_at && new Date(d.submitted_at) >= sevenDaysAgo
        ).length;

        // فیلتر کردن نوبت‌های ۷ روز گذشته
        const recentAppts = (apptsRes.data.results || []).filter((a: any) => {
          const dateStr = a.created_at || a.start_at;
          return dateStr && new Date(dateStr) >= sevenDaysAgo;
        }).length;

        // محاسبه پیام‌های خوانده نشده
        const unread = (threadsRes.data.results || []).reduce((sum: number, t: any) => 
          sum + (t.unread_count || 0), 0
        );

        setStats({
          users: usersRes.data.count || 0,
          doctorsApproved: docsApprovedRes.data.count || 0,
          doctorsPending: docsPendingRes.data.count || 0,
          unreadMessages: unread,
          recentVerifications: recentVerifs,
          recentAppointments: recentAppts,
        });
      } catch (err) {
        console.error("Failed to fetch stats", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-[#2993A3]" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-full flex flex-col space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800">داشبورد مدیریت</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* کارت کاربران */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-500">کاربران</span>
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3]">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <span className="text-3xl font-extrabold text-gray-800">{stats.users}</span>
          <span className="text-xs text-gray-400">تعداد کل کاربران ثبت‌نام شده</span>
        </div>

        {/* کارت پزشکان */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-500">پزشکان</span>
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3]">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold text-green-600 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                احراز شده
              </span>
              <span className="text-2xl font-extrabold text-gray-800">{stats.doctorsApproved}</span>
            </div>
            <div className="flex flex-col gap-1 border-r border-gray-100 pr-4">
              <span className="text-xs font-bold text-yellow-600 flex items-center gap-1">
                <Hourglass className="w-3 h-3" />
                در انتظار
              </span>
              <span className="text-2xl font-extrabold text-gray-800">{stats.doctorsPending}</span>
            </div>
          </div>
        </div>

        {/* کارت پیام‌های جدید */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-500">پیام‌های جدید</span>
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3]">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <span className="text-3xl font-extrabold text-gray-800">{stats.unreadMessages}</span>
          <span className="text-xs text-gray-400">پیام‌های خوانده نشده در گفتگوها</span>
        </div>

        {/* کارت درخواست‌های احراز هویت اخیر */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-500">احراز هویت (۷ روز اخیر)</span>
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3]">
              <FileCheck className="w-5 h-5" />
            </div>
          </div>
          <span className="text-3xl font-extrabold text-gray-800">{stats.recentVerifications}</span>
          <span className="text-xs text-gray-400">درخواست‌های جدید پزشکان</span>
        </div>

        {/* کارت نوبت‌های اخیر */}
        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col gap-4 transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-gray-500">نوبت‌ها (۷ روز اخیر)</span>
            <div className="p-2.5 rounded-xl bg-[#F5FAFF] text-[#2993A3]">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <span className="text-3xl font-extrabold text-gray-800">{stats.recentAppointments}</span>
          <span className="text-xs text-gray-400">نوبت‌های رزرو شده در هفته گذشته</span>
        </div>

      </div>
    </div>
  );
}