export default function Loading() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-pulse">
            <div className="col-span-1 lg:col-span-8">
                <div className="card h-72" style={{ background: 'var(--gray-100)' }} />
            </div>
            <div className="col-span-1 lg:col-span-4 space-y-6">
                <div className="card h-32" style={{ background: 'var(--gray-100)' }} />
                <div className="card h-32" style={{ background: 'var(--gray-100)' }} />
            </div>
        </div>
    );
}
