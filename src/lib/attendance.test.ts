import { describe, expect, it } from "vitest";
import { attendanceKind, buildAttendance } from "@/lib/attendance";

const NOW = Date.parse("2026-11-08T06:00:00Z");

describe("attendance counting", () => {
  it("counts six hours as a full day and a punch-out within three hours as a half day", () => {
    expect(attendanceKind("2026-11-08T00:00:00Z", "2026-11-08T06:00:00Z", "2026-11-08", NOW)).toBe("FULL");
    expect(attendanceKind("2026-11-08T04:00:00Z", "2026-11-08T06:00:00Z", "2026-11-08", NOW)).toBe("HALF");
    expect(attendanceKind("2026-11-08T01:00:00Z", "2026-11-08T05:30:00Z", "2026-11-08", NOW)).toBe("SHORT");
  });

  it("keeps an open punch as on duty until six hours, then full, and a forgotten punch-out as missed", () => {
    expect(attendanceKind("2026-11-08T04:00:00Z", null, "2026-11-08", NOW)).toBe("ON_DUTY");
    expect(attendanceKind("2026-11-07T22:00:00Z", null, "2026-11-08", NOW)).toBe("FULL");
    expect(attendanceKind("2026-11-07T02:00:00Z", null, "2026-11-07", NOW)).toBe("MISSED");
    expect(attendanceKind(null, null, "2026-11-08", NOW)).toBe("ABSENT");
  });

  it("fills days with no punch as absent for each officer", () => {
    const { rows } = buildAttendance(
      [{ id: "so", name: "Field", code: "SO-0002" }],
      [],
      "2026-11-07",
      "2026-11-08",
      NOW,
    );
    expect(rows.map((row) => row.kind)).toEqual(["ABSENT", "ABSENT"]);
  });
});
