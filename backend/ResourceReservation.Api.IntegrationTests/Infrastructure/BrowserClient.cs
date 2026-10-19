using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Mvc.Testing.Handlers;
using ResourceReservation.Api.Configuration;
using ResourceReservation.Api.DTOs;

namespace ResourceReservation.Api.IntegrationTests.Infrastructure;

public static class BrowserClient
{
    // Behaves like the frontend: keeps cookies, including the session and
    // anti-forgery cookies, and adds an anti-forgery token to each request that
    // changes something. Like the frontend, it fetches the token once, shared
    // by parallel requests, and again after signing in or out, because the
    // token is bound to the user. Requests that already have a token or a
    // bearer header are sent as they are.
    public static HttpClient CreateBrowserClient(this WebApplicationFactory<Program> factory)
    {
        return factory.CreateDefaultClient(
            factory.ClientOptions.BaseAddress,
            new AntiforgeryTokenHandler(),
            new CookieContainerHandler());
    }

    // The same, without adding anti-forgery tokens, for tests of the protection itself.
    public static HttpClient CreateBrowserClientWithoutCsrfTokens(this WebApplicationFactory<Program> factory)
    {
        return factory.CreateDefaultClient(factory.ClientOptions.BaseAddress, new CookieContainerHandler());
    }

    private sealed class AntiforgeryTokenHandler : DelegatingHandler
    {
        private readonly SemaphoreSlim _fetching = new(1, 1);
        private string? _token;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var method = request.Method;
            var isUnsafe = method != HttpMethod.Get && method != HttpMethod.Head && method != HttpMethod.Options;

            if (isUnsafe &&
                request.Headers.Authorization is null &&
                !request.Headers.Contains(AuthCookieOptions.AntiforgeryHeaderName))
            {
                request.Headers.Add(
                    AuthCookieOptions.AntiforgeryHeaderName,
                    await GetTokenAsync(request.RequestUri!, cancellationToken));
            }

            var response = await base.SendAsync(request, cancellationToken);
            var path = request.RequestUri!.AbsolutePath;

            if (response.IsSuccessStatusCode && (path == "/api/auth/login" || path == "/api/auth/logout"))
            {
                _token = null;
            }

            return response;
        }

        private async Task<string> GetTokenAsync(Uri requestUri, CancellationToken cancellationToken)
        {
            await _fetching.WaitAsync(cancellationToken);

            try
            {
                if (_token is null)
                {
                    using var tokenRequest = new HttpRequestMessage(HttpMethod.Get, new Uri(requestUri, "/api/auth/csrf"));
                    using var tokenResponse = await base.SendAsync(tokenRequest, cancellationToken);
                    tokenResponse.EnsureSuccessStatusCode();
                    _token = (await tokenResponse.Content.ReadFromJsonAsync<CsrfTokenDto>(cancellationToken))!.Token;
                }

                return _token;
            }
            finally
            {
                _fetching.Release();
            }
        }
    }
}
