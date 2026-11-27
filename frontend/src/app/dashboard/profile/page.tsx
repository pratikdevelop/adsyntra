"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneIphoneRoundedIcon from "@mui/icons-material/PhoneIphoneRounded";
import VerifiedRoundedIcon from "@mui/icons-material/VerifiedRounded";
import PhotoCameraRoundedIcon from "@mui/icons-material/PhotoCameraRounded";
import SecurityRoundedIcon from "@mui/icons-material/SecurityRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";

type ToastState = { open: boolean; message: string; severity: "success" | "error" };

function InfoCard({ title, description, icon, children }: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card variant="outlined" className="rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" sx={{ borderRadius: 3, borderColor: "divider", boxShadow: "0 4px 18px rgba(15,23,42,.035)" }}>
      <CardContent sx={{ p: { xs: 2.25, sm: 3 }, "&:last-child": { pb: { xs: 2.25, sm: 3 } } }}>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">{icon}</div>
          <div><Typography variant="h6" fontWeight={800}>{title}</Typography>{description && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>{description}</Typography>}</div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function displayDate(value: Date | null | undefined): string {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export default function ProfilePage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [toast, setToast] = useState<ToastState>({ open: false, message: "", severity: "success" });

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? "");
    setLastName(user.lastName ?? "");
  }, [user?.id, user?.firstName, user?.lastName]);

  const showToast = (message: string, severity: ToastState["severity"] = "success") => {
    setToast({ open: true, message, severity });
  };

  const saveName = async () => {
    if (!user) return;
    setSavingName(true);
    try {
      await user.update({ firstName: firstName.trim(), lastName: lastName.trim() });
      await user.reload();
      showToast("Your profile information has been updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to update your profile.", "error");
    } finally {
      setSavingName(false);
    }
  };

  const uploadProfileImage = async (file?: File) => {
    if (!user || !file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Choose an image file to upload.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Profile images must be 5 MB or smaller.", "error");
      return;
    }
    setUploadingImage(true);
    try {
      await user.setProfileImage({ file });
      await user.reload();
      showToast("Profile photo updated.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to upload your profile photo.", "error");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeProfileImage = async () => {
    if (!user) return;
    setRemovingImage(true);
    try {
      await user.setProfileImage({ file: null });
      await user.reload();
      showToast("Profile photo removed.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to remove your profile photo.", "error");
    } finally {
      setRemovingImage(false);
    }
  };

  if (!isLoaded) {
    return <Box className="flex min-h-[420px] items-center justify-center gap-3 text-slate-500"><CircularProgress size={22} /><Typography variant="body2">Loading your profile…</Typography></Box>;
  }

  if (!isSignedIn || !user) {
    return <Card variant="outlined" sx={{ maxWidth: 900, mx: "auto", borderRadius: 3 }}><CardContent><Alert severity="info">Sign in to view your AdSyntra profile.</Alert></CardContent></Card>;
  }

  const primaryEmail = user.primaryEmailAddress;
  const primaryEmailVerified = primaryEmail?.verification?.status === "verified";
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "AdSyntra user";
  const initials = [user.firstName?.[0], user.lastName?.[0]].filter(Boolean).join("").toUpperCase() || primaryEmail?.emailAddress?.[0]?.toUpperCase() || "A";
  const externalAccounts = user.externalAccounts ?? [];
  const phones = user.phoneNumbers ?? [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-600">AdSyntra · Account</p>
          <Typography component="h1" variant="h4" fontWeight={850} letterSpacing="-.035em" className="dark:!text-slate-100" sx={{ mt: 0.5, color: "#0f172a" }}>My profile</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1, maxWidth: 680, lineHeight: 1.7 }}>Manage your personal information and review the sign-in identities connected to your AdSyntra account.</Typography>
        </div>
        <Button component={Link} href="/dashboard/settings" variant="outlined" startIcon={<SettingsOutlinedIcon />} sx={{ borderRadius: 2.5, textTransform: "none", fontWeight: 700 }}>Open settings</Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <Card variant="outlined" className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900" sx={{ borderRadius: 3 }}>
            <div className="h-24 bg-gradient-to-br from-blue-700 via-indigo-600 to-violet-600" />
            <CardContent sx={{ pt: 0, pb: 2.75 }}>
              <div className="-mt-12 flex items-end justify-between gap-3">
                <Avatar src={user.imageUrl} alt={fullName} sx={{ width: 88, height: 88, border: "4px solid white", bgcolor: "#4338ca", fontSize: 27, fontWeight: 800 }}>{initials}</Avatar>
                <Chip size="small" color={primaryEmailVerified ? "success" : "warning"} icon={primaryEmailVerified ? <VerifiedRoundedIcon /> : undefined} label={primaryEmailVerified ? "Verified email" : "Email not verified"} variant="outlined" sx={{ mb: 1, bgcolor: "white" }} />
              </div>
              <Typography variant="h6" fontWeight={850} sx={{ mt: 1.75 }}>{fullName}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{primaryEmail?.emailAddress ?? "No primary email address"}</Typography>
              <Divider sx={{ my: 2 }} />
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3"><Typography variant="caption" color="text.secondary">Account created</Typography><Typography variant="caption" fontWeight={700}>{displayDate(user.createdAt)}</Typography></div>
                <div className="flex items-center justify-between gap-3"><Typography variant="caption" color="text.secondary">Sign-in methods</Typography><Typography variant="caption" fontWeight={700}>{externalAccounts.length}</Typography></div>
              </div>
            </CardContent>
          </Card>
          <Alert severity="info" variant="outlined" sx={{ borderRadius: 2.5, alignItems: "flex-start" }}>
            Your profile identity is managed by Clerk. Google Ads and Meta Ads connections are managed separately in <Link href="/dashboard/provider" className="font-semibold underline">Provider Settings</Link>.
          </Alert>
        </aside>

        <main className="min-w-0 space-y-4">
          <InfoCard title="Personal information" description="Update the name and profile picture shown throughout AdSyntra." icon={<EditRoundedIcon />}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <Avatar src={user.imageUrl} alt={fullName} sx={{ width: 54, height: 54, bgcolor: "#4338ca", fontWeight: 800 }}>{initials}</Avatar>
                <div className="min-w-0 flex-1"><Typography variant="body2" fontWeight={800}>Profile photo</Typography><Typography variant="caption" color="text.secondary">JPG, PNG or WEBP · up to 5 MB</Typography></div>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => void uploadProfileImage(event.target.files?.[0])} />
                <Button size="small" variant="outlined" startIcon={uploadingImage ? <CircularProgress size={15} /> : <PhotoCameraRoundedIcon />} disabled={uploadingImage || removingImage} onClick={() => fileInputRef.current?.click()} sx={{ borderRadius: 2, textTransform: "none" }}>{uploadingImage ? "Uploading…" : "Change photo"}</Button>
                {user.hasImage && <Button size="small" color="inherit" disabled={uploadingImage || removingImage} onClick={() => void removeProfileImage()} sx={{ textTransform: "none" }}>{removingImage ? "Removing…" : "Remove"}</Button>}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="profile-first-name" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">First name</label><input id="profile-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={100} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder="First name" /></div>
              <div><label htmlFor="profile-last-name" className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-300">Last name</label><input id="profile-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={100} className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" placeholder="Last name" /></div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <Typography variant="caption" color="text.secondary">Name updates require the name fields to be enabled in your Clerk application settings.</Typography>
              <Button variant="contained" disableElevation startIcon={savingName ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />} disabled={savingName || (firstName.trim() === (user.firstName ?? "") && lastName.trim() === (user.lastName ?? ""))} onClick={() => void saveName()} sx={{ borderRadius: 2, px: 2.5, textTransform: "none", fontWeight: 750 }}>{savingName ? "Saving…" : "Save profile"}</Button>
            </div>
          </InfoCard>

          <InfoCard title="Contact methods" description="Your current email and phone details, including verification status." icon={<EmailOutlinedIcon />}>
            <div className="space-y-3">
              {(user.emailAddresses ?? []).map((email) => {
                const verified = email.verification?.status === "verified";
                const primary = email.id === user.primaryEmailAddressId;
                return <div key={email.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <Avatar sx={{ width: 36, height: 36, bgcolor: "#eef2ff", color: "#4338ca" }}><EmailOutlinedIcon sx={{ fontSize: 18 }} /></Avatar>
                  <div className="min-w-0 flex-1"><Typography variant="body2" fontWeight={750} sx={{ overflowWrap: "anywhere" }}>{email.emailAddress}</Typography><Typography variant="caption" color="text.secondary">{primary ? "Primary email" : "Additional email"}</Typography></div>
                  <Chip size="small" label={verified ? "Verified" : "Unverified"} color={verified ? "success" : "warning"} variant="outlined" />
                </div>;
              })}
              {phones.map((phone) => {
                const verified = phone.verification?.status === "verified";
                return <div key={phone.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <Avatar sx={{ width: 36, height: 36, bgcolor: "#eef2ff", color: "#4338ca" }}><PhoneIphoneRoundedIcon sx={{ fontSize: 18 }} /></Avatar>
                  <div className="min-w-0 flex-1"><Typography variant="body2" fontWeight={750}>{phone.phoneNumber}</Typography><Typography variant="caption" color="text.secondary">{phone.id === user.primaryPhoneNumberId ? "Primary phone" : "Additional phone"}</Typography></div>
                  <Chip size="small" label={verified ? "Verified" : "Unverified"} color={verified ? "success" : "warning"} variant="outlined" />
                </div>;
              })}
            </div>
            <Alert severity="info" sx={{ mt: 2, borderRadius: 2 }}>Adding, removing or changing contact methods requires Clerk verification flows. Those actions are not exposed until your Clerk application verification settings are confirmed.</Alert>
          </InfoCard>

          <InfoCard title="Sign-in identities & security" description="These identities belong to your AdSyntra sign-in account, not your connected advertising accounts." icon={<SecurityRoundedIcon />}>
            {externalAccounts.length ? (
              <div className="space-y-2">
                {externalAccounts.map((account) => (
                  <div key={account.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <Avatar sx={{ width: 36, height: 36, bgcolor: "#f1f5f9", color: "#334155", fontSize: 12, fontWeight: 800 }}>{String(account.provider ?? "ID").slice(0, 2).toUpperCase()}</Avatar>
                    <div className="min-w-0 flex-1"><Typography variant="body2" fontWeight={750}>{String(account.provider ?? "External provider").replace(/_/g, " ")}</Typography><Typography variant="caption" color="text.secondary">{account.emailAddress || "Connected sign-in identity"}</Typography></div>
                    <Chip size="small" label="Connected" color="success" variant="outlined" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No external sign-in identities are linked to this Clerk user.</div>
            )}
            <Divider sx={{ my: 2 }} />
            <Stack sx={{ alignItems: "flex-start" }} direction="row" spacing={1.5} >
              <LoginRoundedIcon color="primary" sx={{ mt: 0.25 }} />
              <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={800}>Authentication and sessions</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>Password, multi-factor authentication, passkeys, recovery codes and active sessions remain controlled by Clerk. Their availability depends on your Clerk instance configuration; advanced management will be added after those capabilities are verified.</Typography></Box>
            </Stack>
          </InfoCard>
        </main>
      </div>

      <Snackbar open={toast.open} autoHideDuration={4500} onClose={() => setToast((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: "top", horizontal: "right" }}>
        <Alert severity={toast.severity} variant="filled" onClose={() => setToast((current) => ({ ...current, open: false }))} sx={{ width: "100%", borderRadius: 2 }}>{toast.message}</Alert>
      </Snackbar>
    </div>
  );
}
