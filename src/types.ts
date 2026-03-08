export interface TimeUnit {
    id: string;
    name: string;
    short: string;
    isBulk: boolean;
    ratio: number;
}

export interface SystemRules {
    method: 'direct' | 'roll';
    checkDC: number;
    checkFormula: string;
}

export interface GuidanceTier {
    id: string;
    name: string;
    modifier: number;
    costs: Record<string, number>;
    progress: Record<string, number>;
}

export interface ProjectTemplate {
    id: string;
    name: string;
    target: number;
    rewardUuid: string;
}

export interface LearningProject {
    id: string;
    name: string;
    progress: number;
    maxProgress: number;
    guidanceType: string;
    tutelage: number;
    rewardUuid: string;
    isCompleted: boolean;
}

export interface TimeBank {
    total: number;
}
