import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function ProfilePhoto({
  path,
  name,
  className,
}: {
  path?: string | null;
  name: string;
  className?: string;
}) {
  const { data } = useQuery({
    queryKey: ["profile-photo", path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await api.storage.from("profile-photos").createSignedUrl(path!, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
  const letter = (name.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <Avatar className={cn("size-9", className)}>
      {data ? <AvatarImage src={data} alt="" /> : null}
      <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{letter}</AvatarFallback>
    </Avatar>
  );
}
