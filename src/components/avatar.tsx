import { initials } from "@/lib/labels";

export function Avatar({
  member,
  size = 28,
  className = "",
}: {
  member: { name: string; color: string };
  size?: number;
  className?: string;
}) {
  return (
    <span
      title={member.name}
      className={`rounded-full text-white font-bold flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, background: member.color, fontSize: Math.round(size * 0.4) }}
    >
      {initials(member.name)}
    </span>
  );
}
