/**
 * scripts/migrate-passwords.ts
 *
 * One-time script to migrate plain text passwords to bcrypt hashes.
 * Run this AFTER deploying the authentication refactor.
 */
import { supabase } from '../api/config/supabase.js';
import { hashPassword } from '../api/utils/passwordUtils.js';

async function migratePasswords() {
  console.log('🔐 Starting password migration...\n');

  try {
    // Fetch all users with plain text passwords (no password_hash)
    const { data: users, error } = await supabase
      .from('users')
      .select('id, username, password, password_hash')
      .or('password_hash.is.null,password_hash.eq.');

    if (error) {
      console.error('❌ Error fetching users:', error.message);
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log('✅ No passwords to migrate. All users already have hashed passwords.');
      process.exit(0);
    }

    console.log(`Found ${users.length} user(s) with plain text passwords:\n`);

    let migratedCount = 0;
    let skippedCount = 0;

    for (const user of users) {
      if (!user.password || !user.password.trim()) {
        console.log(`⏭️  Skipping ${user.username} (no password set)`);
        skippedCount++;
        continue;
      }

      try {
        console.log(`🔄 Migrating password for: ${user.username}`);

        // Hash the plain text password
        const hash = await hashPassword(user.password);

        // Update user with hashed password
        const { error: updateError } = await supabase
          .from('users')
          .update({
            password_hash: hash,
            password: null, // Clear plain text password
            password_changed_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(`   ❌ Failed to update ${user.username}:`, updateError.message);
          continue;
        }

        console.log(`   ✅ Successfully migrated ${user.username}`);
        migratedCount++;
      } catch (err: any) {
        console.error(`   ❌ Error migrating ${user.username}:`, err.message);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migratedCount}`);
    console.log(`   ⏭️  Skipped: ${skippedCount}`);
    console.log(`   ❌ Failed: ${users.length - migratedCount - skippedCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (migratedCount > 0) {
      console.log('🎉 Password migration complete!');
      console.log('ℹ️  Users can now log in with their existing passwords.');
      console.log('ℹ️  Passwords are now securely hashed with bcrypt.\n');
    }

    process.exit(0);
  } catch (err: any) {
    console.error('\n❌ Migration failed:', err.message);
    process.exit(1);
  }
}

// Run migration
migratePasswords();
