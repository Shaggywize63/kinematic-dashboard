
'use client';
const C = { gray:'#7A8BA0', grayd:'#2E445E', border:'#1E2D45', red:'#E01E2C' };

export default function HRRecruitmentPage() {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ background:'#0E1420', border:`1px solid ${C.border}`, borderRadius:16, padding:32, textAlign:'center' }}>
        <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, marginBottom:8 }}>HR & Recruitment</div>
        <div style={{ fontSize:14, color:C.gray, marginBottom:24 }}>Manage applicants and employees</div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:10, background:'rgba(224,30,44,0.08)', border:'1px solid rgba(224,30,44,0.2)', borderRadius:12, padding:'12px 20px' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:C.red, animation:'pulse 2s infinite' }}/>
          <span style={{ fontSize:13, color:C.red, fontWeight:600 }}>Connect your Railway API to see live data</span>
        </div>
        <div style={{ marginTop:20, fontSize:12, color:C.grayd }}>
          Set NEXT_PUBLIC_API_URL in your .env.local to your Railway URL
        </div>
      </div>
    </div>
  );
}
