# Domain Setup for vr.aethervtc.ai

## Current Status: ✅ DNS Configured, ⏳ Vercel Dashboard Step Needed

### DNS Configuration (COMPLETED ✅)

**GoDaddy DNS Record:**
- **Subdomain**: `vr`
- **Type**: CNAME
- **Target**: `cname.vercel-dns.com`
- **TTL**: 600 seconds
- **Status**: Already configured from previous deployment

You can verify this by running:
```bash
dig vr.aethervtc.ai CNAME
```

### Vercel Project Configuration (COMPLETED ✅)

**Project Details:**
- **Project ID**: `prj_rfz8tC09aojJEnILxLIXVGZd3Y9S`
- **Team ID**: `team_y66Lva6Z6McXlI2DBcOrjroQ`
- **Project Name**: `aether-vr-platform`
- **Current URL**: https://aether-vr-platform-3kou50pj8-the-fort-ai.vercel.app

### Remaining Step: Add Domain in Vercel Dashboard

**Why Manual?** The Vercel CLI returns a 403 "Not authorized" error when attempting to add the domain programmatically. This is likely due to team permissions or the domain already being claimed by another project.

**Manual Steps (2 minutes):**

1. **Navigate to Project Settings:**
   - Go to: https://vercel.com/the-fort-ai/aether-vr-platform/settings/domains
   - Or: Vercel Dashboard → "aether-vr-platform" project → Settings → Domains

2. **Add Domain:**
   - Click the "Add" button
   - Enter: `vr.aethervtc.ai`
   - Click "Add"

3. **Verification (Automatic):**
   - Vercel will check the DNS CNAME record
   - Since it's already configured correctly, verification should be instant ✅
   - You'll see a green checkmark next to the domain

4. **SSL Certificate (Automatic):**
   - Vercel will automatically provision an SSL certificate
   - This usually takes 1-2 minutes
   - The domain will show as "Ready" once complete

5. **Test:**
   - Visit: https://vr.aethervtc.ai
   - Should redirect to the VR training platform
   - SSL certificate should be valid

### Troubleshooting

**If domain verification fails:**
1. Check DNS propagation: https://dnschecker.org/#CNAME/vr.aethervtc.ai
2. Wait 10-15 minutes for DNS to propagate globally
3. Click "Refresh" in Vercel dashboard

**If domain is already claimed:**
1. Go to: https://vercel.com/the-fort-ai
2. Search for projects using "vr.aethervtc.ai"
3. Remove the domain from the old project first
4. Then add it to `aether-vr-platform`

### Alternative: Vercel CLI with Different Scope

If you have a Vercel API token with proper permissions:

```bash
export VERCEL_TOKEN=your-token-here
vercel domains add vr.aethervtc.ai --scope the-fort-ai
```

### Verification Commands

**Check DNS:**
```bash
dig vr.aethervtc.ai CNAME
nslookup vr.aethervtc.ai
```

**Check SSL Certificate:**
```bash
curl -I https://vr.aethervtc.ai
openssl s_client -connect vr.aethervtc.ai:443 -servername vr.aethervtc.ai
```

**Check Vercel Project:**
```bash
vercel ls
vercel domains ls
```

## Next Steps After Domain is Live

1. **Update Environment Variables** (if needed)
   - Add production API URLs
   - Configure Twilio credentials
   - Set up analytics

2. **Test VR Features:**
   - Load in Meta Quest 2/3
   - Test BlazePose mirror
   - Test Twilio video integration
   - Verify all VR components work

3. **Clean Up Old Repo:**
   - Remove VR components from `aether_beta_2_obe_fork`
   - Update main app to redirect `/vVRTraining` to `vr.aethervtc.ai`
   - Remove unused VR dependencies

## Support

If you encounter any issues, check:
- **Vercel Status**: https://www.vercel-status.com/
- **GoDaddy DNS Status**: https://status.godaddy.com/
- **DNS Propagation**: https://dnschecker.org/

---

*Last Updated: $(date)*
*Automated by NEXUS*
