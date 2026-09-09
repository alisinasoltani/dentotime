"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import useSWR from "swr";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getAdminRatingParameters,
  updateAdminRatingParameter,
} from "@/lib/admin-rating-parameters";
import type { RatingParameter } from "@/lib/types";


function ParameterEditor({
  parameter,
  onSaved,
}: {
  parameter: RatingParameter;
  onSaved: (parameter: RatingParameter) => void;
}) {
  const [draft, setDraft] = useState(parameter);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(parameter), [parameter]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = await updateAdminRatingParameter(parameter.id, {
        label: draft.label,
        prompt: draft.prompt,
        position: draft.position,
        is_active: draft.is_active,
        options: draft.options,
      });
      onSaved(saved);
      toast.success("متغیر امتیاز ذخیره شد.");
    } catch {
      toast.error("ذخیره متغیر امتیاز انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-background p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-bold text-foreground">{parameter.label}</h2>
          <Badge variant="secondary">{parameter.input_type}</Badge>
        </div>
        <code className="text-xs text-muted-foreground">{parameter.key}</code>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`label-${parameter.id}`}>عنوان نمایشی</FieldLabel>
          <Input
            id={`label-${parameter.id}`}
            value={draft.label}
            onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`prompt-${parameter.id}`}>متن سؤال</FieldLabel>
          <Textarea
            id={`prompt-${parameter.id}`}
            value={draft.prompt}
            onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`position-${parameter.id}`}>ترتیب نمایش</FieldLabel>
          <Input
            id={`position-${parameter.id}`}
            type="number"
            min={0}
            max={32767}
            value={draft.position}
            onChange={(event) => setDraft((current) => ({ ...current, position: Number(event.target.value) }))}
            required
          />
        </Field>
        {draft.options.length > 0 ? (
          <Field>
            <FieldLabel>گزینه‌ها</FieldLabel>
            <div className="grid gap-2 sm:grid-cols-2">
              {draft.options.map((option, index) => (
                <Input
                  key={option.value}
                  aria-label={`عنوان گزینه ${option.value}`}
                  value={option.label}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    options: current.options.map((item, itemIndex) => (
                      itemIndex === index ? { ...item, label: event.target.value } : item
                    )),
                  }))}
                  required
                />
              ))}
            </div>
          </Field>
        ) : null}
        <Field>
          <FieldLabel>وضعیت نمایش</FieldLabel>
          <ToggleGroup
            type="single"
            value={draft.is_active === false ? "inactive" : "active"}
            onValueChange={(value) => {
              if (value) setDraft((current) => ({ ...current, is_active: value === "active" }));
            }}
            variant="outline"
          >
            <ToggleGroupItem value="active">فعال</ToggleGroupItem>
            <ToggleGroupItem value="inactive">غیرفعال</ToggleGroupItem>
          </ToggleGroup>
        </Field>
        <Button type="submit" disabled={saving} className="self-start">
          {saving ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}
          {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
        </Button>
      </FieldGroup>
    </form>
  );
}

export default function AdminRatingParametersPage() {
  const { data, isLoading, mutate } = useSWR(
    "admin-rating-parameters",
    getAdminRatingParameters,
    { revalidateOnFocus: false },
  );

  return (
    <div className="flex min-h-full flex-col gap-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-foreground">متغیرهای امتیازدهی</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          عنوان، سؤال، گزینه‌ها، ترتیب و وضعیت متغیرهای فرم امتیازدهی را مدیریت کنید.
        </p>
      </header>
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-96 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(data ?? []).map((parameter) => (
            <ParameterEditor
              key={parameter.id}
              parameter={parameter}
              onSaved={(saved) => void mutate(
                (current) => current?.map((item) => item.id === saved.id ? saved : item),
                { revalidate: false },
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
