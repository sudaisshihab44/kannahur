import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useParams } from "react-router-dom";

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL || "", import.meta.env.VITE_SUPABASE_ANON_KEY || "");

export default function TrackToken() {
  const { tokenId } = useParams();
  const [data, setData] = useState<any>(null);

  const fetchStatus = async () => {
    if (!tokenId) return;
    try {
      const res = await fetch(`/api/track/${tokenId}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch (err) {
      console.error("Error fetching tracker data:", err);
    }
  };

  useEffect(() => {
    fetchStatus();
    const channel = supabase
      .channel("tokens-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, fetchStatus)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenId]);

  if (!data?.myToken) return <div className="p-6 text-center">Loading your queue status...</div>;

  const { myToken, currentServing, aheadCount } = data;
  const progress = Math.max(0, 100 - aheadCount * 20); // simple gamified progress bar

  return (
    <div className="max-w-md mx-auto p-6 text-center">
      <h1 className="text-2xl font-bold mb-2">Your Token: {myToken.token_number}</h1>
      <p className="text-gray-500 mb-6">{myToken.department_name} • Dr. {myToken.doctor_name}</p>

      {myToken.status === "called" ? (
        <div className="bg-green-600 text-white rounded-xl p-6 mb-6 animate-pulse">
          <p className="text-2xl font-bold">🎉 It's Your Turn!</p>
          <p className="mt-1">Please proceed to the consultation room now.</p>
        </div>
      ) : (
        <>
          <div className="bg-green-50 rounded-xl p-6 mb-6">
            <p className="text-sm text-gray-500">Now Serving</p>
            <p className="text-4xl font-bold text-green-600">{currentServing?.token_number ?? "—"}</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div className="bg-green-500 h-4 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-gray-600 mb-6">{aheadCount} patient{aheadCount !== 1 ? "s" : ""} ahead of you</p>
          {aheadCount <= 2 && (
            <p className="mt-4 text-orange-600 font-semibold">🔔 Almost your turn — please be near the waiting area!</p>
          )}
        </>
      )}

      <p className="text-lg font-medium">Estimated wait: ~{myToken.estimated_wait_time ?? 0} mins</p>
      {myToken.status !== "called" && (
        <p className="text-sm text-gray-500 mt-1">
          Expected Consult: {new Date(Date.now() + (myToken.estimated_wait_time ?? 0) * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </div>
  );
}
