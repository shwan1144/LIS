export declare class SaveSubLabPriceDto {
    testId: string;
    price: number;
}
export declare class SaveSubLabDto {
    name: string;
    username: string;
    password?: string;
    isActive?: boolean;
    prices?: SaveSubLabPriceDto[];
}
