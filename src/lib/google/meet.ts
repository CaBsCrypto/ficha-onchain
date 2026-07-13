/**
 * Google Meet REST API v2 helpers.
 * Docs: https://developers.google.com/meet/api/reference/rest/v2/spaces/create
 */
import { google } from "googleapis";
import type { GoogleOAuth2 } from "./auth";

export interface MeetSpace {
  /** Internal resource name, e.g. "spaces/jQCFfuBOdN5z" */
  name: string;
  /** Public join link, e.g. "https://meet.google.com/jqc-fubo-dn5z" */
  meetingUri: string;
  /** Short meeting code, e.g. "jqc-fubo-dn5z" */
  meetingCode: string;
}

/** Creates a new Google Meet space on behalf of the authenticated doctor. */
export async function createMeetSpace(auth: GoogleOAuth2): Promise<MeetSpace> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meet = (google as any).meet({ version: "v2", auth });
  const response = await meet.spaces.create({ requestBody: {} });
  const { name, meetingUri, meetingCode } = response.data;
  if (!name || !meetingUri || !meetingCode) {
    throw new Error(
      "Google Meet API returned incomplete space data. Check OAuth scopes.",
    );
  }
  return { name, meetingUri, meetingCode };
}

/** Fetches current state of an existing Meet space. */
export async function getMeetSpace(
  auth: GoogleOAuth2,
  spaceName: string,
): Promise<MeetSpace> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meet = (google as any).meet({ version: "v2", auth });
  const response = await meet.spaces.get({ name: spaceName });
  const { name, meetingUri, meetingCode } = response.data;
  if (!name || !meetingUri || !meetingCode) {
    throw new Error("Could not retrieve Meet space data.");
  }
  return { name, meetingUri, meetingCode };
}
