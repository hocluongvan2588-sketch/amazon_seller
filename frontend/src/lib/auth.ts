import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

export const supa = createClient(
  import.meta.env.VITE_SUPABASE_URL!,
  import.meta.env.VITE_SUPABASE_ANON_KEY!
);

export function useAuthRole() {
  const [role, setRole] = useState<'admin'|'operator'|'viewer'|'auditor'>('viewer');
  useEffect(() => {
    const fetchRole = async () => {
      const { data: { user} } = await supa.auth.getUser();
      if (!user) { setRole('viewer'); return; }
      const { data: profile } = await supa
        .from('profiles')
        .select('org_role')
        .eq('id', user.id)
        .single();
      setRole(profile?.org_role ?? 'viewer');
    };
    fetchRole();
    const { data: { subscription} } = supa.auth.onAuthStateChanged(fetchRole);
    return () => subscription.unsubscribe();
  }
  , []);
  return role;
}
