using System.Diagnostics.CodeAnalysis;

namespace ResourceReservation.Api.Services;

public enum ServiceErrorKind
{
    Validation,
    Unauthorized,
    NotFound,
    Forbidden,
    Conflict,
    Unavailable
}

// An expected failure, such as "this slot is already taken". Unexpected
// failures are exceptions and are handled by the global exception handler.
public sealed record ServiceError(ServiceErrorKind Kind, string Message)
{
    public static ServiceError Validation(string message) => new(ServiceErrorKind.Validation, message);

    public static ServiceError Unauthorized(string message) => new(ServiceErrorKind.Unauthorized, message);

    public static ServiceError NotFound(string message) => new(ServiceErrorKind.NotFound, message);

    public static ServiceError Forbidden() =>
        new(ServiceErrorKind.Forbidden, "You do not have permission to access this resource.");

    public static ServiceError Conflict(string message) => new(ServiceErrorKind.Conflict, message);

    public static ServiceError Unavailable(string message) => new(ServiceErrorKind.Unavailable, message);
}

public sealed class ServiceResult<T>
{
    private ServiceResult(T? value, ServiceError? error)
    {
        Value = value;
        Error = error;
    }

    public T? Value { get; }

    public ServiceError? Error { get; }

    [MemberNotNullWhen(true, nameof(Value))]
    [MemberNotNullWhen(false, nameof(Error))]
    public bool IsSuccess => Error is null;

    public static implicit operator ServiceResult<T>(T value) => new(value, null);

    public static implicit operator ServiceResult<T>(ServiceError error) => new(default, error);
}

public sealed class ServiceResult
{
    private ServiceResult(ServiceError? error)
    {
        Error = error;
    }

    public static ServiceResult Success { get; } = new(null);

    public ServiceError? Error { get; }

    [MemberNotNullWhen(false, nameof(Error))]
    public bool IsSuccess => Error is null;

    public static implicit operator ServiceResult(ServiceError error) => new(error);
}
