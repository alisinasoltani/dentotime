// components/doctor/account-owner-select.tsx
'use client';

import { Controller } from 'react-hook-form';
import { cn } from '@/lib/utils';

const options = [
  { value: 'DOCTOR', label: 'پزشک' },
  { value: 'ASSISTANT', label: 'دستیار پزشک' },
  { value: 'CLINIC', label: 'کلینیک/مرکز درمانی' },
];

export function AccountOwnerSelect({ control }: { control: any }) {
  return (
    <Controller
      control={control}
      name="accountOwner"
      render={({ field, fieldState: { error } }) => (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {options.map((opt) => {
              const isSelected = field.value === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex cursor-pointer items-center justify-start p-4 gap-2 rounded-xl border-2 py-3 text-sm font-medium transition-colors',
                    isSelected
                      ? 'border-[#5FB4FF] bg-[#d8eef5] text-black'
                      : 'bg-[#E9F5F9] text-gray-700 hover:bg-[#d8eef5]'
                  )}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    checked={isSelected}
                    onChange={() => field.onChange(opt.value)}
                    className="hidden"
                  />
                  <span className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-sm border-2',
                    isSelected ? 'border-white bg-white' : 'border-[#5FB4FF] bg-white'
                  )}>
                    {isSelected && <div className="h-2 w-2 bg-[#5FB4FF]" />}
                  </span>
                  {opt.label}
                </label>
              );
            })}
          </div>
          {error && <p className="mt-2 text-xs text-red-500">{error.message}</p>}
        </div>
      )}
    />
  );
}