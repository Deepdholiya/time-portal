import { Search } from "lucide-react";
import { Input } from "@/components/ui";

/** The toolbar search box used on every list page: first control on the left, same width and height everywhere. */
export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input size="sm" className="tp-search" icon={<Search size={14} />} placeholder={placeholder} aria-label={placeholder.replace(/…$/, "")}
      value={value} onChange={(e) => onChange(e.target.value)} />
  );
}
