"use client";

import React from "react";
import { User } from "@/lib/users";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MoreVertical, Trash2, UserCircle, Calendar } from "lucide-react";
import { format } from "date-fns-jalali";

interface Props {
  user: User;
  onDeactivate: (user: User) => void;
}

const UserRow = React.memo(({ user, onDeactivate }: Props) => {
  const firstName = user.first_name || "";
  const lastName = user.last_name || "";
  const username = user.username || "نامشخص";
  const profilePicture = user.profile_picture || undefined;
  const fullName = `${firstName} ${lastName}`.trim() || "کاربر ناشناس";

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 transition-shadow hover:shadow-sm">
      {/* User Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="w-12 h-12 border border-gray-200 flex-shrink-0">
          <AvatarImage src={profilePicture} />
          <AvatarFallback>{firstName?.[0] || "U"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-800 text-sm truncate flex items-center gap-1.5">
            <UserCircle className="h-3.5 w-3.5 text-[#2993A3]" />
            {fullName}
          </h3>
          <p className="text-xs text-gray-500 truncate">@{username}</p>
        </div>
      </div>

      {/* Date Joined */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 text-xs text-gray-500 bg-gray-50 px-3 py-1 rounded-full">
          <Calendar className="h-3 w-3 text-[#2993A3]" />
          عضویت از: {format(new Date(user.date_joined), "yyyy/MM/dd")}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-gray-100">
              <MoreVertical className="h-5 w-5 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => onDeactivate(user)} 
              className="text-red-500 focus:text-red-500 cursor-pointer"
            >
              <Trash2 className="h-4 w-4 ml-2" />
              حذف حساب کاربری
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
UserRow.displayName = "UserRow";
export default UserRow;