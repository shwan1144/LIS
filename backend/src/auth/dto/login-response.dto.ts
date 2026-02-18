export class LabDto {
  id: string;
  code: string;
  name: string;
  labelSequenceBy?: string;
  sequenceResetBy?: string;
}

export class UserDto {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
}

export class LoginResponseDto {
  accessToken: string;
  user: UserDto;
  lab: LabDto;
}
