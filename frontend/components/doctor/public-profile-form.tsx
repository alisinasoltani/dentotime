"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import { toast } from "sonner";
import api from "@/lib/api";
import { getPublicCatalog } from "@/lib/public-doctors";
import type { DoctorPublicProfile, PublicCatalog } from "@/lib/types";
import { useDoctorContext } from "@/context/doctor-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend, FieldDescription, FieldError } from "@/components/ui/field";

const textFields = [
  { key: "specialty", label: "حرفه و تخصص", max: 255 },
  { key: "experience", label: "خلاصه سابقه حرفه‌ای", max: 255 },
  { key: "clinic_name", label: "نام مطب یا کلینیک", max: 255 },
  { key: "bio", label: "درباره پزشک", multiline: true },
  { key: "education", label: "تحصیلات تخصصی و تاریخ‌ها", multiline: true },
  { key: "clinical_history", label: "سوابق و تجربه بالینی و تاریخ‌ها", multiline: true },
  { key: "certifications", label: "دوره‌ها و گواهی‌های تکمیلی", multiline: true },
  { key: "address", label: "آدرس کامل مطب", multiline: true },
  { key: "map_url", label: "پیوند موقعیت روی نقشه", max: 200 },
] as const;

export function PublicProfileForm() {
  const { user, verificationStatus } = useDoctorContext();
  const { data, error, mutate } = useSWR(user ? ["doctor-public-profile", user.id] : null, async () => {
    const [profile, catalog] = await Promise.all([
      api.get<DoctorPublicProfile>("/doctors/me/profile/"), getPublicCatalog(),
    ]);
    return { profile: profile.data, catalog };
  });

  return (
    <section className="rounded-2xl border bg-background p-5 md:p-8" dir="rtl" aria-labelledby="public-profile-title">
      <h2 id="public-profile-title" className="text-xl font-bold">اطلاعات پروفایل عمومی پزشک</h2>
      <p className="my-4 text-sm leading-7 text-muted-foreground">نام و تصویر از بخش بالا نمایش داده می‌شوند. فقط اطلاعات واقعی خود را وارد کنید؛ بخش‌های خالی بدون ادعای پیش‌فرض نمایش داده می‌شوند. نمایش عمومی و رزرو نوبت به تأیید حساب نیاز دارد.</p>
      {verificationStatus === "APPROVED" && user && <Link className="mb-5 inline-flex underline" href={`/doctors/${user.id}`} target="_blank" rel="noreferrer">مشاهده صفحه عمومی من</Link>}
      {error ? <FieldError>دریافت اطلاعات ناموفق بود. <Button type="button" variant="outline" onClick={() => void mutate()}>تلاش دوباره</Button></FieldError> : !data ? <p role="status">در حال دریافت اطلاعات…</p> : (
        <ProfileEditor key={String(user?.id)} initial={data.profile} catalog={data.catalog} onSaved={(profile) => { void mutate({ ...data, profile }, false); }} />
      )}
    </section>
  );
}

function ProfileEditor({ initial, catalog, onSaved }: { initial: DoctorPublicProfile; catalog: PublicCatalog; onSaved: (profile: DoctorPublicProfile) => void }) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      // The catalog is authoritative; inactive choices cannot be submitted.
      const payload = { ...values,
        services: values.services.filter(id => catalog.services.some(item => item.id === id)),
        insurances: values.insurances.filter(id => catalog.insurances.some(item => item.id === id)),
      };
      const { data } = await api.patch<DoctorPublicProfile>("/doctors/me/profile/", payload);
      setValues(data);
      onSaved(data);
      toast.success("اطلاعات پروفایل عمومی ذخیره شد.");
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        setErrors(Object.fromEntries(Object.entries(error.response.data).map(([key, value]) => [key, Array.isArray(value) ? value.join(" ") : String(value)])));
      }
      toast.error("ذخیره اطلاعات انجام نشد. موارد مشخص‌شده را بررسی کنید.");
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={save}>
      <FieldSet disabled={saving}>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {textFields.map(field => {
            const id = `profile-${field.key}`;
            const shared = { id, value: values[field.key] ?? "", maxLength: "max" in field ? field.max : 10000,
              "aria-invalid": Boolean(errors[field.key]), "aria-describedby": errors[field.key] ? `${id}-error` : undefined,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValues(previous => ({ ...previous, [field.key]: e.target.value })),
            };
            return <Field key={field.key} data-invalid={Boolean(errors[field.key])}>
              <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
              {"multiline" in field ? <Textarea {...shared} rows={4} /> : <Input {...shared} type={field.key === "map_url" ? "url" : "text"} dir={field.key === "map_url" ? "ltr" : "rtl"} />}
              {errors[field.key] && <FieldError id={`${id}-error`}>{errors[field.key]}</FieldError>}
            </Field>;
          })}
        </FieldGroup>
        {(["insurances", "services"] as const).map(key => (
          <FieldSet key={key}>
            <FieldLegend>{key === "insurances" ? "بیمه‌های طرف قرارداد" : "خدمات قابل رزرو"}</FieldLegend>
            <FieldDescription>{key === "insurances" ? "بیمه‌های مورد پذیرش را انتخاب کنید. پذیرش بدون بیمه نیز نیاز به انتخاب «آزاد» دارد." : "فقط خدماتی را انتخاب کنید که ارائه می‌دهید. بیمار بر اساس خدمت و بیمه به شما معرفی می‌شود."}</FieldDescription>
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              {catalog[key].map(item => <Field key={item.id} orientation="horizontal">
                <Checkbox id={`profile-${key}-${item.id}`} checked={values[key].includes(item.id)} onCheckedChange={checked => setValues(previous => ({ ...previous, [key]: checked === true ? [...new Set([...previous[key], item.id])] : previous[key].filter(id => id !== item.id) }))} />
                <FieldLabel htmlFor={`profile-${key}-${item.id}`}>{"name" in item ? item.name : item.title}</FieldLabel>
              </Field>)}
            </FieldGroup>
            {errors[key] && <FieldError>{errors[key]}</FieldError>}
          </FieldSet>
        ))}
        <Button type="submit" disabled={saving} className="w-full sm:w-fit">{saving ? "در حال ذخیره…" : "ذخیره پروفایل عمومی"}</Button>
      </FieldSet>
    </form>
  );
}
