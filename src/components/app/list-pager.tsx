import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { NativeSelect } from "@/components/app/select-native";
import { Button } from "@/components/ui/button";

export function usePagedRows<T>(rows: readonly T[], resetKey: unknown) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  useEffect(() => {
    setPage(1);
  }, [resetKey, pageSize]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.min(page, pages);
  const start = (safe - 1) * pageSize;
  return {
    page: safe,
    pages,
    pageSize,
    total: rows.length,
    pageRows: rows.slice(start, start + pageSize),
    setPage,
    setPageSize,
  };
}

function pageNumbers(page: number, pages: number): Array<number | "gap"> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const out: Array<number | "gap"> = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pages - 1, page + 1);
  if (from > 2) out.push("gap");
  for (let n = from; n <= to; n += 1) out.push(n);
  if (to < pages - 1) out.push("gap");
  out.push(pages);
  return out;
}

export function ListPager({
  page,
  pages,
  total,
  pageSize,
  noun,
  onPage,
  onSize,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  noun: string;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <div>
        Showing {start}–{end} of {total} {noun}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span>Rows</span>
          <NativeSelect value={String(pageSize)} onChange={(e) => onSize(Number(e.target.value))} className="h-8 w-[4.5rem]" aria-label="Rows per page">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </NativeSelect>
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft />
          </Button>
          {pageNumbers(page, pages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1" aria-hidden>
                …
              </span>
            ) : (
              <Button
                key={item}
                type="button"
                size="icon"
                variant={item === page ? "default" : "outline"}
                className="size-8"
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPage(item)}
              >
                {item}
              </Button>
            ),
          )}
          <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}
