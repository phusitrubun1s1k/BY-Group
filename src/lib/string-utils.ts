export const MAX_NAME_CHAR = 16;

export const truncateName = (name: string = '', limit: number = MAX_NAME_CHAR) => {
    if (!name) return '';
    return name.length > limit ? name.substring(0, limit - 3) + '...' : name;
};
