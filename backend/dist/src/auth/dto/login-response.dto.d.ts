export declare class LabDto {
    id: string;
    code: string;
    name: string;
    labelSequenceBy?: string;
    sequenceResetBy?: string;
    enableOnlineResults?: boolean;
}
export declare class UserDto {
    id: string;
    username: string;
    fullName: string | null;
    role: string;
}
export declare class LoginResponseDto {
    accessToken: string;
    refreshToken?: string;
    user: UserDto;
    lab: LabDto;
}
