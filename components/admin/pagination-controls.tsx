import { Button } from "@/components/ui/button";


export function PaginationControls({
  count,
  page,
  hasNext,
  hasPrevious,
  onPageChange,
}: {
  count: number;
  page: number;
  hasNext: boolean;
  hasPrevious: boolean;
  onPageChange: (page: number) => void;
}) {
  if (!hasNext && !hasPrevious) return null;
  return (
    <nav className="flex items-center justify-center gap-3 pt-4" aria-label="صفحه‌بندی">
      <Button
        type="button"
        variant="outline"
        disabled={!hasPrevious}
        onClick={() => onPageChange(page - 1)}
      >
        صفحه قبل
      </Button>
      <span className="text-sm text-gray-500">صفحه {page} از {Math.max(1, Math.ceil(count / 20))}</span>
      <Button
        type="button"
        variant="outline"
        disabled={!hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        صفحه بعد
      </Button>
    </nav>
  );
}
