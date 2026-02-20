export class LabDto {
  id: string;
  code: string;
  name: string;
  labelSequenceBy?: string;
  sequenceResetBy?: string;
  enableOnlineResults?: boolean;
}

export class UserDto {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
  isImpersonation?: boolean;
}

export class LoginResponseDto {
  accessToken: string;
  refreshToken?: string;
  user: UserDto;
  lab: LabDto;
}
