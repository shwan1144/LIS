export declare class LabDto {
    id: string;
    code: string;
    name: string;
    labelSequenceBy?: string;
    sequenceResetBy?: string;
}
export declare class UserDto {
    id: string;
    username: string;
    fullName: string | null;
    role: string;
}
export declare class LoginResponseDto {
    accessToken: string;
    user: UserDto;
    lab: LabDto;
}
