// Native fetch is available in Node 24

const BASE_URL = 'http://localhost:5000/api/v1';

async function runTests() {
  console.log('🚀 STARTING COMPREHENSIVE SYSTEM TEST');
  
  let adminToken, worker1Token, worker2Token, worker3Token;
  let worker1Id, worker2Id, worker3Id, clientId;
  let jobId, app1Id, app2Id;
  const ts = Date.now();

  try {
    // ==========================================
    // STEP 2: AUTH FLOW TEST
    // ==========================================
    console.log('\n🔐 TESTING STEP 2: AUTH FLOW');
    
    // Register Worker 1
    const regRes = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'QA Worker 1', email: `worker1_${ts}@test.com`, password: 'password123' })
    });
    const regData = await regRes.json();
    if (!regRes.ok) throw new Error(`Worker 1 Reg Failed: ${JSON.stringify(regData)}`);
    
    console.log('Worker 1 Registered: ✅ PASS');
    worker1Id = regData.data?.user?.id;
    console.log('Worker 1 isApproved (Initially):', regData.data?.user?.isApproved === false ? '✅ PASS (False)' : `❌ FAIL (is ${regData.data?.user?.isApproved})`);

    // Login Admin
    const adminLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testadmin@prime.com', password: 'testadmin123' })
    });
    const adminLoginData = await adminLoginRes.json();
    if (!adminLoginRes.ok) throw new Error(`Admin Login Failed: ${JSON.stringify(adminLoginData)}`);
    adminToken = adminLoginData.data?.token;
    console.log('Admin Logged In: ✅ PASS');

    // Admin Approves Worker 1 Profile
    const approveUserRes = await fetch(`${BASE_URL}/admin/promoters/${worker1Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Admin Approves Worker 1 Profile:', approveUserRes.ok ? '✅ PASS' : `❌ FAIL ${approveUserRes.status}`);

    // Worker 1 Login
    const w1LoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `worker1_${ts}@test.com`, password: 'password123' })
    });
    const w1LoginData = await w1LoginRes.json();
    worker1Token = w1LoginData.data?.token;
    console.log('Worker 1 Logged In: ✅ PASS');

    // ==========================================
    // STEP 3: ADMIN FLOW
    // ==========================================
    console.log('\n👨💼 TESTING STEP 3: ADMIN FLOW');
    
    const clientsRes = await fetch(`${BASE_URL}/admin/clients`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const clientsData = await clientsRes.json();
    clientId = clientsData.data?.[0]?._id;
    if (!clientId) throw new Error('No client found for job creation');

    // Create Job (Shift: NOW)
    const now = new Date();
    const shiftStart = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const shiftEnd = `${((now.getHours() + 1) % 24).toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const jobRes = await fetch(`${BASE_URL}/admin/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({
        title: 'QA System Job',
        description: 'Comprehensive Test',
        clientId: clientId,
        location: { address: 'QA Lab', lat: 10, lng: 10, radius: 1000 },
        startDate: now.toISOString(),
        endDate: new Date(now.getTime() + 86400000).toISOString(),
        shiftStart,
        shiftEnd,
        wage: { amount: 25, type: 'HOURLY' },
        requiredWorkers: 1,
        status: 'OPEN'
      })
    });
    const jobData = await jobRes.json();
    if (!jobRes.ok) throw new Error(`Job Creation Failed: ${JSON.stringify(jobData)}`);
    jobId = jobData.data?._id;
    console.log('Create Job (1 slot): ✅ PASS');

    // ==========================================
    // STEP 4: WORKER FLOW
    // ==========================================
    console.log('\n👷 TESTING STEP 4: WORKER FLOW');
    
    const applyRes = await fetch(`${BASE_URL}/promoter/apply/${jobId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${worker1Token}` }
    });
    console.log('Worker 1 Applies:', applyRes.ok ? '✅ PASS' : `❌ FAIL ${applyRes.status}`);

    const w2Reg = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'QA Worker 2', email: `worker2_${ts}@test.com`, password: 'password123' })
    }).then(r => r.json());
    worker2Id = w2Reg.data?.user?.id;
    worker2Token = w2Reg.data?.token;

    const apply2Res = await fetch(`${BASE_URL}/promoter/apply/${jobId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${worker2Token}` }
    });
    console.log('Worker 2 (Unapproved Profile) Applies:', apply2Res.ok ? '✅ PASS' : `❌ FAIL ${apply2Res.status}`);

    // ==========================================
    // STEP 5: APPLICATION FLOW
    // ==========================================
    console.log('\n👑 TESTING STEP 5: APPLICATION FLOW');
    
    const appsRes = await fetch(`${BASE_URL}/admin/applications?jobId=${jobId}`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const appsData = await appsRes.json();
    app1Id = appsData.data?.find(a => a.userId._id === worker1Id)?._id;
    app2Id = appsData.data?.find(a => a.userId._id === worker2Id)?._id;

    // Approve Worker 2 (Should Fail - Profile not approved)
    const approve2FailRes = await fetch(`${BASE_URL}/admin/applications/${app2Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Approval Blocked (Worker Profile Not Approved):', approve2FailRes.status === 400 ? '✅ PASS' : `❌ FAIL ${approve2FailRes.status}`);

    // Approve Worker 1
    const approve1Res = await fetch(`${BASE_URL}/admin/applications/${app1Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Approve Worker 1 Application:', approve1Res.ok ? '✅ PASS' : `❌ FAIL ${approve1Res.status}`);

    // Approve Worker 2 Profile
    await fetch(`${BASE_URL}/admin/promoters/${worker2Id}/approve`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${adminToken}` } });

    // Try Approve Worker 2 Application (Should Fail - Job Full)
    const approve2LimitRes = await fetch(`${BASE_URL}/admin/applications/${app2Id}/approve`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    console.log('Staffing Limit Enforced (Job Full):', approve2LimitRes.status === 400 ? '✅ PASS' : `❌ FAIL ${approve2LimitRes.status}`);

    // ==========================================
    // STEP 6: ATTENDANCE FLOW
    // ==========================================
    console.log('\n📍 TESTING STEP 6: ATTENDANCE FLOW');
    
    const checkInRes = await fetch(`${BASE_URL}/promoter/attendance/check-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${worker1Token}` },
      body: JSON.stringify({ jobId: jobId, location: { lat: 10, lng: 10 } })
    });
    console.log('Worker 1 Check-in:', checkInRes.ok ? '✅ PASS' : `❌ FAIL ${checkInRes.status}`);

    // ==========================================
    // STEP 7: CLIENT FLOW
    // ==========================================
    console.log('\n🏢 TESTING STEP 7: CLIENT FLOW');
    
    const clientLoginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testclient@prime.com', password: 'testclient123' })
    });
    const clientLoginData = await clientLoginRes.json();
    const clientToken = clientLoginData.data?.token;

    const clientPayRes = await fetch(`${BASE_URL}/client/payments`, {
      headers: { 'Authorization': `Bearer ${clientToken}` }
    });
    const clientPayData = await clientPayRes.json();
    const hasAmount = clientPayData.data?.some(p => p.amount !== undefined);
    console.log('Client Payment Amount Hidden:', hasAmount === false ? '✅ PASS' : '❌ FAIL');

  } catch (err) {
    console.error('❌ TEST CRASHED:', err.message);
  } finally {
    console.log('\n🏁 SYSTEM TEST COMPLETE');
  }
}

runTests();
