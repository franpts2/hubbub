export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-black tracking-tight ${className}`}>
      hub<span className="text-punch">bub</span>
    </span>
  );
}
