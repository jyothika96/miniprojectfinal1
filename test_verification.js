// Complete Automated Verification Test Suite for CDSEWS
const http = require('http');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: json,
        });
      });
    });

    req.on('error', (err) => reject(err));

    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log(' CDSEWS FULL COMPREHENSIVE TEST SUITE EXECUTION');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Health & DB Check
  console.log('--- Test 1: System Health & Database Connectivity ---');
  const healthRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/health',
    method: 'GET',
  });
  assert(healthRes.statusCode === 200, 'Health endpoint responds 200');
  assert(healthRes.data?.database?.connected === true, 'MySQL 8.0 connected successfully');

  // 2. Authentication for each of the 4 roles
  console.log('\n--- Test 2: Authentication & Token Verification for All 4 Roles ---');
  const credentials = [
    { role: 'admin', email: 'admin@healthsurveillance.org', pass: 'Admin@123' },
    { role: 'epidemiologist', email: 'dr.sharma@healthsurveillance.org', pass: 'Doctor@123' },
    { role: 'health_officer', email: 'rajesh.kumar@healthsurveillance.org', pass: 'Officer@123' },
    { role: 'analyst', email: 'priya.patel@healthsurveillance.org', pass: 'Analyst@123' },
  ];

  const tokens = {};

  for (const cred of credentials) {
    const loginRes = await request(
      {
        hostname: 'localhost',
        port: 5000,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      { email: cred.email, password: cred.pass }
    );

    assert(loginRes.statusCode === 200, `Login status 200 for role: ${cred.role}`);
    assert(loginRes.data?.token && loginRes.data?.user?.role === cred.role, `Valid token and role returned for: ${cred.role}`);
    tokens[cred.role] = loginRes.data?.token;

    // Verify token with /me endpoint
    const meRes = await request({
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { Authorization: `Bearer ${tokens[cred.role]}` },
    });
    assert(meRes.statusCode === 200, `/api/auth/me accepts token for: ${cred.role}`);
    assert(meRes.data?.user?.role === cred.role, `/api/auth/me verified server-side identity: ${meRes.data?.user?.full_name}`);
  }

  // 3. Test Invalid Credentials
  console.log('\n--- Test 3: Rejection of Invalid Credentials & Demo Exposure Check ---');
  const badLogin = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@healthsurveillance.org', password: 'WrongPassword999!' }
  );
  assert(badLogin.statusCode === 401, 'Bad password correctly returns 401 Unauthorized');

  // Verify demo credentials route does NOT exist
  const demoRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/auth/demo-users',
    method: 'GET',
  });
  assert(demoRes.statusCode === 404, 'Public demo credentials endpoint has been removed (404)');

  // 4. Role-Based Access Control (RBAC) Enforcement
  console.log('\n--- Test 4: Role-Based Access Control (RBAC) Protections ---');
  
  // Unauthenticated request to protected endpoint
  const unauthRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/dashboard/summary',
    method: 'GET',
  });
  assert(unauthRes.statusCode === 401, 'Missing token correctly rejected with 401 Unauthorized');

  // Analyst attempts to create a case report (should be 403 Forbidden)
  const analystCaseRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cases',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.analyst}`,
      },
    },
    {
      disease_id: 1,
      region_id: 1,
      facility_id: 1,
      report_date: '2026-11-01',
      case_count: 5,
    }
  );
  assert(analystCaseRes.statusCode === 403, 'Analyst cannot create cases (403 Forbidden correctly enforced)');

  // Health Officer attempts to update threshold settings (Admin only -> should be 403)
  const officerThreshRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/meta/thresholds/1',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.health_officer}`,
      },
    },
    { weekly_threshold: 50, spike_percentage: 25 }
  );
  assert(officerThreshRes.statusCode === 403, 'Health Officer cannot modify thresholds (403 Forbidden correctly enforced)');

  // Admin updates threshold settings -> should be 200
  const adminThreshRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/meta/thresholds/5',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.admin}`,
      },
    },
    { weekly_threshold: 5, spike_percentage: 20, is_active: true }
  );
  assert(adminThreshRes.statusCode === 200, 'Admin can successfully update thresholds (200 OK)');

  // 5. Strict Validation Tests
  console.log('\n--- Test 5: Strict Case Report Validation ---');

  // 5a: Future Date Prevention
  const tomorrow = new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0];
  const futureDateRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cases',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.health_officer}`,
      },
    },
    {
      disease_id: 1,
      region_id: 1,
      facility_id: 1,
      report_date: tomorrow,
      case_count: 5,
      hospitalized_count: 1,
      severity_level: 'Moderate',
    }
  );
  assert(futureDateRes.statusCode === 400, 'Future reporting date rejected (400 Bad Request)');
  assert(futureDateRes.data?.message?.includes('cannot be in the future'), 'Descriptive error message for future date');

  // 5b: Hospitalized > Total Cases
  const hospExceedRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cases',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.health_officer}`,
      },
    },
    {
      disease_id: 1,
      region_id: 1,
      facility_id: 1,
      report_date: '2026-11-10',
      case_count: 5,
      hospitalized_count: 10,
      severity_level: 'Moderate',
    }
  );
  assert(hospExceedRes.statusCode === 400, 'Hospitalized count > case count rejected (400 Bad Request)');

  // 5c: Facility and Region Relational Verification (Facility 1 in Region 1, sent with Region 2)
  const facilityMismatchRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cases',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.health_officer}`,
      },
    },
    {
      disease_id: 1,
      region_id: 2,
      facility_id: 1,
      report_date: '2026-11-10',
      case_count: 4,
      hospitalized_count: 1,
      severity_level: 'Moderate',
    }
  );
  assert(facilityMismatchRes.statusCode === 400, 'Facility mismatch with region rejected (400 Bad Request)');
  assert(facilityMismatchRes.data?.message?.includes('does not belong to the selected surveillance region'), 'Relational integrity verified');

  // 5d: Negative case count
  const negativeCountRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cases',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.health_officer}`,
      },
    },
    {
      disease_id: 1,
      region_id: 1,
      facility_id: 1,
      report_date: '2026-11-10',
      case_count: -3,
      hospitalized_count: 0,
      severity_level: 'Moderate',
    }
  );
  assert(negativeCountRes.statusCode === 400, 'Negative case count rejected (400 Bad Request)');

  // 6. Valid Case Report Submission & Threshold Trigger
  console.log('\n--- Test 6: Valid Case Submission & Early-Warning Threshold Trigger ---');
  // First clean any prior test alert for disease 5 in region 3 to ensure fresh trigger test
  const existingAlertsRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/alerts?disease_id=5&region_id=3',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokens.admin}` },
  });
  if (existingAlertsRes.data?.data) {
    for (const alt of existingAlertsRes.data.data) {
      await request({
        hostname: 'localhost',
        port: 5000,
        path: `/api/alerts/${alt.id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokens.admin}` },
      });
    }
  }

  // Disease 5 (Typhoid Fever) in Region 3, Facility 6 (Highland District Infirmary - Region 3)
  const todayStr = new Date().toISOString().split('T')[0];
  const validReportRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/cases',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.health_officer}`,
      },
    },
    {
      disease_id: 5,
      region_id: 3,
      facility_id: 6,
      report_date: todayStr,
      case_count: 10, // Exceeds configured weekly threshold of 5!
      hospitalized_count: 2,
      severity_level: 'Severe',
      suspected_source: 'Contaminated Municipal Pipeline',
      notes: 'Outbreak cluster detected in East Zone residential sector',
    }
  );
  assert(validReportRes.statusCode === 201, 'Valid case report successfully created (201 Created)');
  assert(validReportRes.data?.early_warning?.triggered === true, 'Early-warning threshold alert automatically triggered!');
  
  const createdAlertId = validReportRes.data?.early_warning?.alert?.id;
  assert(Boolean(createdAlertId), `Generated Alert ID: #${createdAlertId}`);

  // 7. Alert Review & Status Transition by Epidemiologist
  console.log('\n--- Test 7: Alert Review, Investigation Trail & Audit Logging ---');
  const reviewRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: `/api/alerts/${createdAlertId}/status`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens.epidemiologist}`,
      },
    },
    {
      status: 'Investigating',
      action_taken: 'Dispatched rapid response water quality inspection unit',
      notes: 'Field epidemiology investigation initialized. Culture tests sent to district lab.',
    }
  );
  assert(reviewRes.statusCode === 200, 'Epidemiologist successfully reviewed alert (200 OK)');

  // Verify alert details and review history
  const alertDetailRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/alerts/${createdAlertId}`,
    method: 'GET',
    headers: { Authorization: `Bearer ${tokens.epidemiologist}` },
  });
  assert(alertDetailRes.statusCode === 200, 'Alert details fetched successfully (200 OK)');
  assert(alertDetailRes.data?.data?.status === 'Investigating', 'Alert status updated to "Investigating"');
  assert(alertDetailRes.data?.data?.reviews?.length >= 1, 'Investigation audit timeline includes review notes');
  assert(alertDetailRes.data?.data?.reviews[0]?.reviewer_role === 'epidemiologist', 'Audit log attributes reviewer role accurately');

  // Verify investigation audit feed
  const invLogRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/investigations?status=Investigating',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokens.analyst}` },
  });
  assert(invLogRes.statusCode === 200, 'Analyst can view investigation audit feed (200 OK)');
  assert(invLogRes.data?.data?.some((i) => i.alert_id === createdAlertId), 'Investigation audit feed contains active alert record');

  // 8. Dashboard Statistics and Trend Curves
  console.log('\n--- Test 8: Dashboard Aggregation & Trend Data Accuracy ---');
  const dashRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/dashboard/summary',
    method: 'GET',
    headers: { Authorization: `Bearer ${tokens.analyst}` },
  });
  assert(dashRes.statusCode === 200, 'Dashboard summary returns 200 OK');
  assert(dashRes.data?.data?.summary?.total_cases > 0, `Total cases counted: ${dashRes.data?.data?.summary?.total_cases}`);
  assert(dashRes.data?.data?.timeline?.length > 0, `30-Day trend timeline records: ${dashRes.data?.data?.timeline?.length}`);
  assert(dashRes.data?.data?.disease_distribution?.length > 0, `Disease distribution entries: ${dashRes.data?.data?.disease_distribution?.length}`);
  assert(dashRes.data?.data?.regional_stats?.length > 0, `Regional surveillance entries: ${dashRes.data?.data?.regional_stats?.length}`);

  // 9. CSV Export Authenticated Download
  console.log('\n--- Test 9: Authenticated CSV Export ---');
  // First test without token -> 401
  const unauthCsv = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/reports/export-csv',
    method: 'GET',
  });
  assert(unauthCsv.statusCode === 401, 'Unauthenticated CSV export returns 401 Unauthorized');

  // Authenticated CSV export with token in query param
  const authCsv = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/reports/export-csv?token=${tokens.analyst}`,
    method: 'GET',
  });
  assert(authCsv.statusCode === 200, 'Authenticated CSV export returns 200 OK');
  assert(authCsv.headers['content-type']?.includes('text/csv'), 'Content-Type is text/csv');
  const csvText = typeof authCsv.data === 'string' ? authCsv.data : JSON.stringify(authCsv.data);
  assert(csvText.includes('Report ID') && csvText.includes('Disease Name') && csvText.includes('ICD Code'), 'CSV contains correct column headers');
  assert(csvText.includes('Contaminated Municipal Pipeline'), 'CSV contains actual database records');

  console.log('\n====================================================');
  console.log(` RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed === 0) {
    console.log('ALL CRITICAL SYSTEM REQUIREMENTS VERIFIED SUCCESSFULLY!');
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
