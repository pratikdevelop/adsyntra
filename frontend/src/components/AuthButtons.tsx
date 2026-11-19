"use client";

import { useState } from "react";
import { useUser } from "@auth0/nextjs-auth0/client";
import {
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import PersonIcon from "@mui/icons-material/Person";
import Link from "next/link";

export default function AuthButtons() {
  const { user, isLoading } = useUser();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center" }}>
        <CircularProgress size={22} />
      </Box>
    );
  }

  // Signed out
  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <a
          href="/api/auth/login"
          className="hidden rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 sm:block"
        >
          Sign In
        </a>
        <a
          href="/api/auth/login?screen_hint=signup"
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Get Started
        </a>
      </div>
    );
  }

  // Signed in
  const handleMenu = (event: React.MouseEvent<HTMLElement>) =>
    setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  return (
    <Box>
      <IconButton onClick={handleMenu} sx={{ p: 0 }}>
        <Avatar
          src={user.picture}
          alt={user.name || "User"}
          sx={{ width: 36, height: 36, bgcolor: "primary.main" }}
        >
          {!user.picture && user.name?.charAt(0).toUpperCase()}
        </Avatar>
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        slotProps={{
          paper: {
            elevation: 3,
            sx: { mt: 1.5, minWidth: 220, borderRadius: 2 },
          },
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" fontWeight="bold" noWrap>
            {user.name}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            display="block"
          >
            {user.email}
          </Typography>
        </Box>
        <Divider sx={{ my: 1 }} />
        <MenuItem
          component={Link}
          href="/dashboard/profile"
          onClick={handleClose}
          sx={{ gap: 1.5 }}
        >
          <PersonIcon fontSize="small" color="action" />
          <Typography variant="body2">Profile Settings</Typography>
        </MenuItem>
        <MenuItem
          component="a"
          href="/api/auth/logout"
          onClick={handleClose}
          sx={{ gap: 1.5, color: "error.main" }}
        >
          <LogoutIcon fontSize="small" color="error" />
          <Typography variant="body2" fontWeight={500}>
            Log Out
          </Typography>
        </MenuItem>
      </Menu>
    </Box>
  );
}
