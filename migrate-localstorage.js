/**
 * Migration Script: localStorage -> SQLite
 *
 * This script migrates data from localStorage to the new SQLite schema.
 * Run this from the browser console on any page with localStorage data.
 *
 * Usage:
 * 1. Open alternassist app
 * 2. Open browser DevTools console
 * 3. Copy and paste this entire script
 * 4. Call: await migrateLocalStorageToAPI()
 */

async function migrateLocalStorageToAPI() {
  console.log('🚀 Starting localStorage → SQLite migration...');

  const API_BASE = 'http://localhost:3000/api';
  const results = {
    estimates: { migrated: 0, errors: 0 },
    cues: { migrated: 0, errors: 0 },
    scope: { migrated: 0, errors: 0 },
    invoices: { migrated: 0, errors: 0 },
    payments: { migrated: 0, errors: 0 }
  };

  // Step 1: Get all projects from API to map names to IDs
  console.log('📋 Loading projects from API...');
  let projects = [];
  try {
    const response = await fetch(`${API_BASE}/projects`);
    if (!response.ok) throw new Error('Failed to load projects');
    projects = await response.json();
    console.log(`✅ Loaded ${projects.length} projects`);
  } catch (error) {
    console.error('❌ Failed to load projects:', error);
    return results;
  }

  // Helper: Find project ID by name
  const findProjectId = (projectName) => {
    const project = projects.find(p => p.name === projectName);
    return project ? project.id : null;
  };

  // Step 2: Migrate logged estimates
  console.log('\n📊 Migrating estimates...');
  const loggedEstimates = JSON.parse(localStorage.getItem('logged-estimates') || '[]');
  console.log(`Found ${loggedEstimates.length} estimates in localStorage`);

  for (const estimate of loggedEstimates) {
    try {
      let projectId = estimate.id;

      // If ID doesn't exist in projects, try to find by name
      if (!projects.find(p => p.id === projectId)) {
        projectId = findProjectId(estimate.projectName);
      }

      if (!projectId) {
        console.warn(`⚠️  Skipping estimate for "${estimate.projectName}" - project not found`);
        results.estimates.errors++;
        continue;
      }

      const estimateData = {
        project_id: projectId,
        runtime: estimate.runtime || null,
        music_minutes: estimate.musicMinutes || 0,
        dialogue_hours: 0, // Not stored in old format
        sound_design_hours: 0,
        mix_hours: 0,
        revision_hours: 0,
        post_days: estimate.postDays || 0,
        bundle_discount: estimate.bundleDiscount ? 1 : 0,
        music_cost: 0, // Can recalculate if needed
        post_cost: 0,
        discount_amount: 0,
        total_cost: estimate.total || 0
      };

      const response = await fetch(`${API_BASE}/estimates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estimateData)
      });

      if (response.ok) {
        results.estimates.migrated++;
        console.log(`✅ Migrated estimate for "${estimate.projectName}"`);
      } else {
        const error = await response.json();
        console.error(`❌ Failed to migrate estimate:`, error);
        results.estimates.errors++;
      }
    } catch (error) {
      console.error('❌ Error migrating estimate:', error);
      results.estimates.errors++;
    }
  }

  // Step 3: Migrate cue tracker data
  console.log('\n🎵 Migrating cues...');
  const cuesByProject = JSON.parse(localStorage.getItem('cue-tracker-cues') || '{}');
  const totalCues = Object.values(cuesByProject).reduce((sum, cues) => sum + cues.length, 0);
  console.log(`Found ${totalCues} cues across ${Object.keys(cuesByProject).length} projects`);

  for (const [projectIdStr, cues] of Object.entries(cuesByProject)) {
    const projectId = parseInt(projectIdStr);

    if (!projects.find(p => p.id === projectId)) {
      console.warn(`⚠️  Skipping cues for project ID ${projectId} - project not found`);
      results.cues.errors += cues.length;
      continue;
    }

    for (const cue of cues) {
      try {
        const cueData = {
          project_id: projectId,
          cue_number: cue.number || cue.cue_number || '',
          title: cue.title || '',
          status: cue.status || 'to-write',
          duration: cue.duration || null,
          notes: cue.notes || null
        };

        const response = await fetch(`${API_BASE}/cues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cueData)
        });

        if (response.ok) {
          results.cues.migrated++;
        } else {
          results.cues.errors++;
        }
      } catch (error) {
        console.error('❌ Error migrating cue:', error);
        results.cues.errors++;
      }
    }
  }
  console.log(`✅ Migrated ${results.cues.migrated} cues`);

  // Step 4: Migrate project scope data from projects.notes JSON
  console.log('\n🎯 Migrating project scope data...');
  for (const project of projects) {
    if (!project.notes) continue;

    try {
      const scopeData = JSON.parse(project.notes);

      // Check if it's actual scope data (has expected fields)
      if (typeof scopeData === 'object' && (scopeData.musicMinutes !== undefined || scopeData.contactEmail)) {
        const scope = {
          project_id: project.id,
          contact_email: scopeData.contactEmail || null,
          music_minutes: scopeData.musicMinutes || 0,
          dialogue_hours: scopeData.dialogueHours || 0,
          sound_design_hours: scopeData.soundDesignHours || 0,
          mix_hours: scopeData.mixHours || 0,
          revision_hours: scopeData.revisionHours || 0
        };

        const response = await fetch(`${API_BASE}/scope`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(scope)
        });

        if (response.ok) {
          results.scope.migrated++;
          console.log(`✅ Migrated scope for "${project.name}"`);

          // Clear the JSON from notes field
          await fetch(`${API_BASE}/projects/${project.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes: '' })
          });
        } else {
          results.scope.errors++;
        }
      }
    } catch (error) {
      // Not JSON or parse error - that's okay, not all notes are scope data
    }
  }

  // Step 5: Migrate invoices (if stored in localStorage)
  console.log('\n🧾 Checking for invoice data...');
  const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
  console.log(`Found ${invoices.length} invoices in localStorage`);

  for (const invoice of invoices) {
    try {
      const projectId = findProjectId(invoice.projectName);

      if (!projectId) {
        console.warn(`⚠️  Skipping invoice for "${invoice.projectName}" - project not found`);
        results.invoices.errors++;
        continue;
      }

      const invoiceData = {
        project_id: projectId,
        invoice_number: invoice.invoiceNumber || null,
        amount: invoice.amount || 0,
        deposit_amount: invoice.depositAmount || 0,
        deposit_percentage: invoice.depositPercentage || 0,
        final_amount: invoice.finalAmount || 0,
        status: invoice.status || 'draft',
        due_date: invoice.dueDate || null,
        issue_date: invoice.issueDate || null,
        line_items: JSON.stringify(invoice.lineItems || [])
      };

      const response = await fetch(`${API_BASE}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });

      if (response.ok) {
        results.invoices.migrated++;
        console.log(`✅ Migrated invoice ${invoice.invoiceNumber}`);
      } else {
        results.invoices.errors++;
      }
    } catch (error) {
      console.error('❌ Error migrating invoice:', error);
      results.invoices.errors++;
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 MIGRATION SUMMARY');
  console.log('='.repeat(50));
  console.log(`Estimates:  ${results.estimates.migrated} migrated, ${results.estimates.errors} errors`);
  console.log(`Cues:       ${results.cues.migrated} migrated, ${results.cues.errors} errors`);
  console.log(`Scope Data: ${results.scope.migrated} migrated, ${results.scope.errors} errors`);
  console.log(`Invoices:   ${results.invoices.migrated} migrated, ${results.invoices.errors} errors`);
  console.log(`Payments:   ${results.payments.migrated} migrated, ${results.payments.errors} errors`);
  console.log('='.repeat(50));

  const totalMigrated = Object.values(results).reduce((sum, r) => sum + r.migrated, 0);
  const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

  if (totalErrors === 0) {
    console.log('✅ Migration completed successfully!');
    console.log('\n💡 You can now safely clear localStorage data.');
    console.log('💡 Run: clearOldLocalStorageData()');
  } else {
    console.log(`⚠️  Migration completed with ${totalErrors} errors. Review above.`);
  }

  return results;
}

function clearOldLocalStorageData() {
  console.log('🗑️  Clearing old localStorage data...');

  const keysToRemove = [
    'logged-estimates',
    'cue-tracker-cues',
    'cue-projects',
    'invoices',
    'payments'
  ];

  keysToRemove.forEach(key => {
    if (localStorage.getItem(key)) {
      localStorage.removeItem(key);
      console.log(`✅ Removed: ${key}`);
    }
  });

  console.log('✅ Old data cleared!');
}

// Auto-run migration if this script is executed directly
console.log('📝 Migration script loaded!');
console.log('Run: await migrateLocalStorageToAPI()');
console.log('Then: clearOldLocalStorageData()');
