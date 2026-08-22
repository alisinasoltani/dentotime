import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DoctorCard } from "@/components/doctors/doctor-card";

describe("DoctorCard", () => {
  it("renders only the public projection and an accessible profile link", () => {
    const { container } = render(
      <DoctorCard
        doctor={{
          id: "42",
          slug: "sara-pezeshk",
          first_name: "سارا",
          last_name: "پزشک",
          display_name: "سارا پزشک",
          clinic_name: "کلینیک آزمون",
          profile_picture: null,
          specialty: "دندان‌پزشک عمومی",
          bio: "",
          experience: "",
          address: "",
          map_url: "",
          services: [],
          insurances: [],
          likes_count: 7,
          average_rating: 4.5,
          vote_count: 8,
        }}
      />,
    );

    expect(screen.getByRole("link").getAttribute("href")).toBe("/doctors/42");
    expect(container.textContent).toContain("دکتر سارا پزشک");
    expect(container.textContent).toContain("4.5 از ۵ (8 رأی)");
    expect(container.textContent).not.toContain("+98");
  });

  it("does not present a zero-review doctor as rated", () => {
    const { container } = render(
      <DoctorCard
        doctor={{
          id: "43",
          slug: "new-doctor",
          first_name: "پزشک",
          last_name: "جدید",
          display_name: "پزشک جدید",
          clinic_name: "مطب",
          profile_picture: null,
          specialty: "دندان‌پزشک عمومی",
          bio: "",
          experience: "",
          address: "",
          map_url: "",
          services: [],
          insurances: [],
          likes_count: 0,
          average_rating: 0,
          vote_count: 0,
        }}
      />,
    );

    expect(container.textContent).toContain("بدون امتیاز");
    expect(container.textContent).not.toContain("0.0 از ۵");
  });
});
