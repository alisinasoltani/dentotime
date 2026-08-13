"use client";

import { useState, useEffect, useCallback } from "react";
import { getDoctorRequests, approveDoctorApi, rejectDoctorApi } from "@/lib/requests";
import { DoctorRequest, DoctorDocument } from "@/lib/types";
import RequestRow from "@/components/admin/requests/request-row";
import RejectModal from "@/components/admin/requests/reject-modal";
import DocumentsModal from "@/components/admin/requests/documents-modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function RequestsPage() {
  const [requests, setRequests] = useState<DoctorRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Search States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Sort States
  const [sortBy, setSortBy] = useState("submitted_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");

  // Status Filter
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "rejected">("all");

  // Modals State
  const [rejectTarget, setRejectTarget] = useState<DoctorRequest | null>(null);
  const [docsData, setDocsData] = useState<{ docs: DoctorDocument[]; name: string } | null>(null);

  // Debounce Search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const statusParam = statusFilter === "all" ? "PENDING" : statusFilter.toUpperCase();
      const orderingParam = `${order === "desc" ? "-" : ""}${sortBy}`;

      const data = await getDoctorRequests({
        search: debouncedSearch,
        verification_status: statusParam,
        ordering: orderingParam,
      });

      // لاگ گرفتن از اولین درخواست برای دیدن ساختار دقیق JSON بک‌اند
      if (data.length > 0) {
        console.log("Structure of first request:", data[1]);
      }

      let filteredData = data;
      if (statusFilter === "all") {
        filteredData = data.filter((r: any) => r.verification_status === "PENDING");
      } else if (statusFilter === "approved") {
        filteredData = data.filter((r: any) => r.verification_status === "APPROVED");
      } else if (statusFilter === "rejected") {
        filteredData = data.filter((r: any) => r.verification_status === "REJECTED");
      }

      setRequests(filteredData);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, statusFilter, sortBy, order]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Actions with Optimistic UI
  const handleApprove = async (id: number) => {
    const prevRequests = requests;
    setRequests(prev => prev.map(r => r.id === id ? { ...r, verification_status: "APPROVED" } : r));
    try {
      await approveDoctorApi(id);
    } catch (err) {
      setRequests(prevRequests);
      console.error(err);
    }
  };

  const handleRejectConfirm = async (rejection_note: string, internal_note: string) => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    const prevRequests = requests;

    setRequests(prev => prev.map(r => r.id === id ? {
      ...r,
      verification_status: "REJECTED",
      rejection_note: `یادداشت پزشک: ${rejection_note} | یادداشت ادمین‌ها: ${internal_note}`,
      processed_at: new Date().toISOString()
    } : r));

    setRejectTarget(null);

    try {
      await rejectDoctorApi(id, rejection_note, internal_note);
    } catch (err) {
      setRequests(prevRequests);
      console.error(err);
    }
  };

  const handleViewDocs = (docs: DoctorDocument[], name: string) => {
    setDocsData({ docs, name });
  };

  const OrderIcon = order === "desc" ? ArrowDown : ArrowUp;

  return (
    // استفاده از w-full min-h-full و حذف overflow-hidden
    <div className="w-full min-h-full bg-white p-4 md:p-8 rounded-2xl flex flex-col space-y-6">
      <h1 className="text-xl md:text-2xl font-bold text-gray-800">درخواست‌های پزشکان</h1>

      {/* First Row: Search & Filters */}
      {/* استفاده از grid برای چیدمان کاملا ریسپانسیو در موبایل */}
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
        <div className="flex flex-col md:flex-row md:items-center gap-2 p-1 border rounded-lg w-full md:w-auto border-gray-200">
          <span className="text-xs text-gray-500 px-2 whitespace-nowrap">مرتب سازی:</span>
          <div className="flex gap-2 w-full">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="flex-1 text-xs border-none bg-transparent focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="text-xs">
                <SelectItem className="text-xs" value="submitted_at">تاریخ ارسال</SelectItem>
                <SelectItem className="text-xs" value="date_joined">تاریخ ساخت حساب</SelectItem>
                <SelectItem className="text-xs" value="username">نام کاربری</SelectItem>
              </SelectContent>
            </Select>

            <Select value={order} onValueChange={(v) => setOrder(v as "asc" | "desc")}>
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

        {/* Status Filter */}
        <div className={cn(
          "flex items-center gap-1 p-1 border rounded-lg w-full md:w-auto",
          statusFilter !== "all" ? "border-[#66D3F7] bg-[#F5FAFF]" : "border-gray-200"
        )}>
          {[
            { val: "all", label: "همه" },
            { val: "approved", label: "تایید شده" },
            { val: "rejected", label: "رد شده" },
          ].map((opt) => (
            <Button
              key={opt.val}
              variant="ghost"
              size="sm"
              onClick={() => setStatusFilter(opt.val as any)}
              className={cn(
                "rounded-md transition-colors flex-1 md:flex-none text-xs h-8",
                statusFilter === opt.val ? "bg-[#66D3F7] text-white hover:bg-[#66D3F7]" : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      <div className="flex-1 space-y-3 pb-4">
        {isLoading ? (
          <p className="text-center text-gray-400 py-8">در حال بارگذاری...</p>
        ) : requests.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-xl border border-gray-100">
            <p className="text-gray-400">درخواستی یافت نشد.</p>
          </div>
        ) : (
          requests.map((req) => (
            <RequestRow
              key={req.id}
              request={req}
              onApprove={handleApprove}
              onReject={(id) => setRejectTarget(requests.find(r => r.id === id) || null)}
              onViewDocs={handleViewDocs}
            />
          ))
        )}
      </div>

      {/* Modals */}
      <RejectModal
        isOpen={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
        doctorName={rejectTarget ? `${rejectTarget.user?.first_name || ""} ${rejectTarget.user?.last_name || ""}` : ""}
      />

      <DocumentsModal
        isOpen={!!docsData}
        onClose={() => setDocsData(null)}
        documents={docsData?.docs || []}
        doctorName={docsData?.name || ""}
      />
    </div>
  );
} 