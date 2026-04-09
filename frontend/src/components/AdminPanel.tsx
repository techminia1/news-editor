import type { FormEvent, RefObject } from 'react';
import { ShieldUser, UserPlus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AdminCreateUserState, AuthUser } from '@/lib/app-models';

interface AdminPanelProps {
  createUserLogoInputRef: RefObject<HTMLInputElement | null>;
  createUserIntroInputRef: RefObject<HTMLInputElement | null>;
  createUserOutroInputRef: RefObject<HTMLInputElement | null>;
  isCreatingUser: boolean;
  newUserForm: AdminCreateUserState;
  newUserIntroVideo: File | null;
  newUserLogo: File | null;
  newUserOutroVideo: File | null;
  users: AuthUser[];
  onFormChange: (field: keyof AdminCreateUserState, value: string) => void;
  onIntroVideoChange: (file: File | null) => void;
  onLogoChange: (file: File | null) => void;
  onOutroVideoChange: (file: File | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function AdminPanel({
  createUserLogoInputRef,
  createUserIntroInputRef,
  createUserOutroInputRef,
  isCreatingUser,
  newUserForm,
  newUserIntroVideo,
  newUserLogo,
  newUserOutroVideo,
  users,
  onFormChange,
  onIntroVideoChange,
  onLogoChange,
  onOutroVideoChange,
  onSubmit,
}: AdminPanelProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldUser className="w-5 h-5" />
            नया यूज़र बनाएं
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <Label htmlFor="newUsername">यूज़रनेम</Label>
              <Input
                id="newUsername"
                value={newUserForm.username}
                onChange={(event) => onFormChange('username', event.target.value)}
                placeholder="जैसे reporter01"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="newDisplayName">रिपोर्टर नाम</Label>
              <Input
                id="newDisplayName"
                value={newUserForm.displayName}
                onChange={(event) => onFormChange('displayName', event.target.value)}
                placeholder="जैसे अनिल मौर्य"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="newPassword">पासवर्ड</Label>
              <Input
                id="newPassword"
                type="password"
                value={newUserForm.password}
                onChange={(event) => onFormChange('password', event.target.value)}
                placeholder="पासवर्ड सेट करें"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="logoFile">असाइन किया गया लोगो</Label>
              <Input
                id="logoFile"
                ref={createUserLogoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp"
                className="mt-1"
                onChange={(event) => onLogoChange(event.target.files?.[0] || null)}
              />
              <p className="text-xs text-slate-500 mt-2">
                यही लोगो यूज़र के प्रीव्यू और फाइनल वीडियो दोनों में अपने आप दिखेगा।
              </p>
              {newUserLogo && (
                <p className="text-xs text-slate-600 mt-1">
                  चुना गया लोगो: {newUserLogo.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="introVideoFile">इंट्रो वीडियो</Label>
              <Input
                id="introVideoFile"
                ref={createUserIntroInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska"
                className="mt-1"
                onChange={(event) => onIntroVideoChange(event.target.files?.[0] || null)}
              />
              <p className="text-xs text-slate-500 mt-2">
                अगर इंट्रो असाइन होगा तो प्रोसेसिंग के समय यह वीडियो मुख्य वीडियो से पहले अपने आप जुड़ जाएगा।
              </p>
              {newUserIntroVideo && (
                <p className="text-xs text-slate-600 mt-1">
                  चुना गया इंट्रो: {newUserIntroVideo.name}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="outroVideoFile">आउट्रो वीडियो</Label>
              <Input
                id="outroVideoFile"
                ref={createUserOutroInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska"
                className="mt-1"
                onChange={(event) => onOutroVideoChange(event.target.files?.[0] || null)}
              />
              <p className="text-xs text-slate-500 mt-2">
                अगर आउट्रो असाइन होगा तो यह वीडियो मुख्य वीडियो के बाद अपने आप जुड़ जाएगा।
              </p>
              {newUserOutroVideo && (
                <p className="text-xs text-slate-600 mt-1">
                  चुना गया आउट्रो: {newUserOutroVideo.name}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isCreatingUser}>
              <UserPlus className="w-4 h-4 mr-2" />
              {isCreatingUser ? 'यूज़र बनाया जा रहा है...' : 'यूज़र बनाएं'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            मौजूदा यूज़र
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>यूज़र</TableHead>
                <TableHead>नाम</TableHead>
                <TableHead>रोल</TableHead>
                <TableHead>लोगो</TableHead>
                <TableHead>इंट्रो</TableHead>
                <TableHead>आउट्रो</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.displayName}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'outline'}>
                      {user.role === 'admin' ? 'एडमिन' : 'यूज़र'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {user.logoUrl ? (
                      <img
                        src={user.logoUrl}
                        alt={`${user.displayName} logo`}
                        className="w-10 h-10 rounded-full border object-cover"
                      />
                    ) : (
                      <span className="text-xs text-slate-500">डिफॉल्ट</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {user.introVideoUrl ? 'असाइन है' : 'नहीं'}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {user.outroVideoUrl ? 'असाइन है' : 'नहीं'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
