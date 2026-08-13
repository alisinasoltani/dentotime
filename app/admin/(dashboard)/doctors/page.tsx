"use client";

import { useState, useEffect, useCallback } from "react";
import { getAdminDoctorDetail, getDoctorsList, deactivateDoctorApi, Doctor } from "@/lib/doctors";
import DoctorRow from "@/components/admin/doctors/doctor-row";
import DeactivateDoctorModal from "@/components/admin/doctors/deactivate-doctor-modal";
import DocumentsModal from "@/components/admin/requests/documents-modal"; // استفاده مجدد از مودال قبلی
import { RatingsModal } from "@/components/admin/doctors/ratings-modal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaginationControls } from "@/components/admin/pagination-controls";

export default function DoctorsListPage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  
  // Search States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  // Sort States
  const [sortBy, setSortBy] = useState("date_joined");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  
  // Modals State
  const [deactivateTarget, setDeactivateTarget] = useState<Doctor | null>(null);
  const [docsData, setDocsData] = useState<{ docs: any[]; name: string } | null>(null);
  const [ratingsData, setRatingsData] = useState<{ doctorId: number; name: string } | null>(null);

  // Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchDoctors = useCallback(async () => {
    setIsLoading(true);
    try {
      const orderingParam = `${order === "desc" ? "-" : ""}${sortBy}`;
      const data = await getDoctorsList({
        search: debouncedSearch,
        ordering: orderingParam,
        page,
      });
      setDoctors(data.results);
      setCount(data.count);
      setHasNext(Boolean(data.next));
      setHasPrevious(Boolean(data.previous));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, sortBy, order, page]);

  useEffect(() => {
    fetchDoctors();
  }, [fetchDoctors]);

  // Actions
  const handleDeactivate = async (reason: string) => {
    if (!deactivateTarget) return;
    const targetId = deactivateTarget.user?.id || (deactivateTarget as any).id;
    const prevDoctors = doctors;
    
    // Optimistic UI: حذف پزشک از لیست بلافاصله
    setDoctors(prev => prev.filter(d => d.id !== deactivateTarget.id));
    setDeactivateTarget(null);
    
    try {
      await deactivateDoctorApi(targetId, reason);
    } catch (err) {
      setDoctors(prevDoctors); // Revert on failure
      console.error(err);
    }
  };

  const handleViewDocs = async (doctor: Doctor, name: string) => {
    try {
      const detail = await getAdminDoctorDetail(doctor.id);
      setDocsData({ docs: detail.documents || [], name });
    } catch (error) {
      console.error("Unable to load doctor documents", error);
    }
  };

  const OrderIcon = order === "desc" ? ArrowDown : ArrowUp;

  return (
    // 1. تغییر p-8 به p-4 md:p-8 و اضافه کردن min-h-full
    <div className="w-full min-h-full flex flex-col space-y-6 bg-white rounded-2xl p-4 md:p-8">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800">لیست پزشکان</h1>

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
            <Select dir="rtl" value={sortBy} onValueChange={(value) => { setSortBy(value); setPage(1); }}>
              {/* 4. اصلاح کلاس‌های نامعتبر تایپوگرافی (w-44 حذف و flex-1 اضافه شد) */}
              <SelectTrigger className="flex-1 text-xs border-none bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem className="text-xs" value="date_joined">تاریخ ساخت حساب</SelectItem>
                <SelectItem className="text-xs" value="first_name">نام</SelectItem>
                <SelectItem className="text-xs" value="verification_reviewed_at">تاریخ احراز هویت</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={order} onValueChange={(v) => { setOrder(v as "asc" | "desc"); setPage(1); }}>
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

      {/* Doctors List */}
      <div className="flex-1 space-y-3 overflow-y-auto pb-4">
        {isLoading ? (
          <p className="text-center text-gray-400 py-8">در حال بارگذاری...</p>
        ) : doctors.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
            <p className="text-gray-400">پزشکی یافت نشد.</p>
          </div>
        ) : (
          doctors.map((doc) => (
            <DoctorRow
              key={doc.id}
              doctor={doc}
              onDeactivate={(d) => setDeactivateTarget(d)}
              onViewDocs={handleViewDocs}
              onViewRatings={(doctor, name) => setRatingsData({ doctorId: doctor.id, name })}
            />
          ))
        )}
      </div>

      <PaginationControls
        count={count}
        page={page}
        hasNext={hasNext}
        hasPrevious={hasPrevious}
        onPageChange={setPage}
      />

      {/* Modals */}
      <DeactivateDoctorModal
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={handleDeactivate}
        doctorName={deactivateTarget ? `${deactivateTarget.user?.first_name || ""} ${deactivateTarget.user?.last_name || ""}` : ""}
      />

      <DocumentsModal
        isOpen={!!docsData}
        onClose={() => setDocsData(null)}
        documents={docsData?.docs || []}
        doctorName={docsData?.name || ""}
      />
      <RatingsModal
        doctorId={ratingsData?.doctorId ?? null}
        doctorName={ratingsData?.name ?? ""}
        onClose={() => setRatingsData(null)}
      />
    </div>
  );
}
