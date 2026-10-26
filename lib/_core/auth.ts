import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { SESSION_TOKEN_KEY, USER_INFO_KEY } from "@/constants/oauth";

export type User = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: "user" | "admin";
  lastSignedIn: Date;
};

export async function getSessionToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return null;
    }

    return await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setSessionToken(token: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      return;
    }

    await SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
  } catch {
    throw new Error("Failed to store session token");
  }
}

export async function removeSessionToken(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      return;
    }

    await SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
  } catch {
    // Ignore cleanup failures. The session state is already invalid.
  }
}

export async function getUserInfo(): Promise<User | null> {
  try {
    if (Platform.OS === "web") {
      return null;
    }

    const info = await SecureStore.getItemAsync(USER_INFO_KEY);
    if (!info) {
      return null;
    }

    const user = JSON.parse(info) as User;
    return user;
  } catch {
    return null;
  }
}

export async function setUserInfo(user: User): Promise<void> {
  try {
    if (Platform.OS === "web") {
      return;
    }

    await SecureStore.setItemAsync(USER_INFO_KEY, JSON.stringify(user));
  } catch {
    // Ignore persistence failures for now; the current session remains valid.
  }
}

export async function clearUserInfo(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      window.localStorage.removeItem(USER_INFO_KEY);
      return;
    }

    await SecureStore.deleteItemAsync(USER_INFO_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}
