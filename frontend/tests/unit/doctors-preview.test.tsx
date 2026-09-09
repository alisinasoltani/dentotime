import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DoctorsPreview from "@/components/home/DoctorsPreview";
import type { PublicDoctor } from "@/lib/types";

function doctor(overrides: Partial<PublicDoctor>): PublicDoctor {
  return {
    id: "1",
    slug: "test-doctor",
    first_name: "آزمایشی",
    last_name: "پزشک",
    display_name: "آزمایشی پزشک",
    profile_picture: null,
    specialty: "دندان‌پزشک عمومی",
    clinic_name: "مطب",
    bio: "",
    experience: "",
    address: "",
    map_url: "",
    services: [],
    insurances: [],
    likes_count: 0,
    average_rating: 0,
    vote_count: 0,
    ...overrides,
  };
}

describe("DoctorsPreview ratings", () => {
  it("rounds rated doctors and labels unrated doctors without a fake score", () => {
    render(
      <DoctorsPreview
        doctors={[
          doctor({ id: "1", average_rating: 4.666666666666667, vote_count: 3 }),
          doctor({ id: "2", slug: "new-doctor", first_name: "جدید" }),
        ]}
        insurances={[]}
      />,
    );

    expect(screen.getAllByText("4.7")).toHaveLength(3);
    expect(screen.queryByText("4.666666666666667")).toBeNull();
    expect(screen.getAllByText("بدون امتیاز")).toHaveLength(3);
    expect(screen.queryByText("0.0")).toBeNull();
  });
});
